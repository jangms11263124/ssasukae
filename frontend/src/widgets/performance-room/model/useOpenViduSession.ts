'use client';

import { useEffect, useRef, useState } from 'react';

import type { Publisher, Session, StreamManager } from 'openvidu-browser';

import { reissueMediaToken, useRoomStore } from '@/entities/room';
import { showToast } from '@/shared/model/toastStore';

import { useStageStore } from './stageStore';

/**
 * 원격 참가자 한 명의 미디어 상태.
 * MediaStream 대신 StreamManager(Subscriber)를 보관한다 — 원격 MediaStream은
 * WebRTC 협상이 끝나야 생기므로, 시점 관리를 openvidu-browser의
 * addVideoElement()에 맡기는 것이 공식 커스텀 렌더링 패턴이다.
 */
export interface RemoteMedia {
  streamManager: StreamManager;
  audioActive: boolean;
  videoActive: boolean;
}

export interface OpenViduSessionApi {
  isConnected: boolean;
  /** 내 캠·마이크 스트림. 권한 거부·장치 없음이면 null(시청 전용) */
  localStream: MediaStream | null;
  /** participantId → 원격 미디어 */
  remoteStreams: ReadonlyMap<number, RemoteMedia>;
}

// 백엔드가 토큰 serverData에 {"participantId":N}을 심는다.
// clientData가 있으면 "client%/%server" 형태라 조각별로 파싱한다.
function parseParticipantId(connectionData: string): number | null {
  for (const part of connectionData.split('%/%')) {
    try {
      const parsed: unknown = JSON.parse(part);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'participantId' in parsed &&
        typeof parsed.participantId === 'number'
      ) {
        return parsed.participantId;
      }
    } catch {
      // JSON이 아닌 조각은 무시한다.
    }
  }

  return null;
}

// OpenVidu 세션 생명주기 훅. 방 입장 토큰으로 세션에 연결해
// 내 미디어를 publish하고 다른 참가자 스트림을 participantId로 매핑해 노출한다.
export function useOpenViduSession(): OpenViduSessionApi {
  const roomId = useRoomStore((state) => state.session?.roomId ?? null);
  const micOn = useStageStore((state) => state.micOn);
  const camOn = useStageStore((state) => state.camOn);

  const [isConnected, setIsConnected] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<ReadonlyMap<number, RemoteMedia>>(new Map());
  const publisherRef = useRef<Publisher | null>(null);

  useEffect(() => {
    if (roomId === null) {
      return;
    }

    let cancelled = false;
    let activeSession: Session | null = null;

    const updateRemote = (participantId: number, media: RemoteMedia | null) => {
      setRemoteStreams((previous) => {
        const next = new Map(previous);
        if (media === null) {
          next.delete(participantId);
        } else {
          next.set(participantId, media);
        }
        return next;
      });
    };

    const connect = async () => {
      // openvidu-browser는 import 시점에 브라우저 API를 참조해 SSR에서 터진다.
      const { OpenVidu } = await import('openvidu-browser');
      if (cancelled) {
        return;
      }

      const openVidu = new OpenVidu();
      openVidu.enableProdMode();

      const joinWithToken = async (token: string): Promise<Session> => {
        const session = openVidu.initSession();

        session.on('streamCreated', (event) => {
          const participantId = parseParticipantId(event.stream.connection.data);
          if (participantId === null) {
            return;
          }

          const subscriber = session.subscribe(event.stream, undefined);
          updateRemote(participantId, {
            streamManager: subscriber,
            audioActive: event.stream.audioActive,
            videoActive: event.stream.videoActive,
          });
        });

        session.on('streamDestroyed', (event) => {
          const participantId = parseParticipantId(event.stream.connection.data);
          if (participantId !== null) {
            updateRemote(participantId, null);
          }
        });

        // 상대가 마이크·캠을 토글하면 이 이벤트로만 알 수 있다.
        session.on('streamPropertyChanged', (event) => {
          if (event.changedProperty !== 'audioActive' && event.changedProperty !== 'videoActive') {
            return;
          }

          const participantId = parseParticipantId(event.stream.connection.data);
          if (participantId === null) {
            return;
          }

          setRemoteStreams((previous) => {
            const current = previous.get(participantId);
            if (current === undefined) {
              return previous;
            }

            const next = new Map(previous);
            next.set(participantId, {
              ...current,
              [event.changedProperty]: event.newValue as boolean,
            });
            return next;
          });
        });

        await session.connect(token);
        return session;
      };

      const initialToken = useRoomStore.getState().session?.openViduToken;
      if (initialToken === undefined) {
        return;
      }

      let session: Session;
      try {
        session = await joinWithToken(initialToken);
      } catch {
        // 토큰은 1회용이라 재마운트(StrictMode 포함)·재입장 시 소진돼 있을 수 있다.
        // 재발급 받아 한 번만 재시도한다.
        const { openviduToken } = await reissueMediaToken(roomId);
        useRoomStore.getState().setOpenViduToken(openviduToken);
        if (cancelled) {
          return;
        }
        session = await joinWithToken(openviduToken);
      }

      if (cancelled) {
        session.disconnect();
        return;
      }

      activeSession = session;
      setIsConnected(true);

      try {
        const publisher = await openVidu.initPublisherAsync(undefined, {
          publishAudio: useStageStore.getState().micOn,
          publishVideo: useStageStore.getState().camOn,
          // 미러링은 렌더링 쪽(StageCameraFeed)에서 처리한다.
          mirror: false,
        });

        if (cancelled) {
          publisher.stream.getMediaStream()?.getTracks().forEach((track) => track.stop());
          return;
        }

        await session.publish(publisher);
        publisherRef.current = publisher;
        setLocalStream(publisher.stream.getMediaStream());
      } catch {
        // 권한 거부·장치 없음이어도 세션은 유지해 시청·청취는 가능하게 한다.
        showToast('카메라·마이크를 사용할 수 없어 시청 전용으로 참여합니다.', 'info');
      }
    };

    connect().catch(() => {
      if (!cancelled) {
        showToast('미디어 서버 연결에 실패했습니다.', 'error');
      }
    });

    return () => {
      cancelled = true;
      publisherRef.current = null;
      activeSession?.disconnect();
      setIsConnected(false);
      setLocalStream(null);
      setRemoteStreams(new Map());
    };
  }, [roomId]);

  // 토글 시점에 publisher가 아직 없으면 생성 시 스토어 값을 읽으므로 놓치지 않는다.
  useEffect(() => {
    publisherRef.current?.publishAudio(micOn);
  }, [micOn]);

  useEffect(() => {
    publisherRef.current?.publishVideo(camOn);
  }, [camOn]);

  return { isConnected, localStream, remoteStreams };
}
