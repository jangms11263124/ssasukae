'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Connection, Publisher, Session, StreamManager } from 'openvidu-browser';

import { useRoomStore } from '@/entities/room';
import { showToast } from '@/shared/model/toastStore';

import { fetchMediaToken } from './openViduMediaToken';
import { useStageStore } from './stageStore';
import { readMicBlocked, useMicBlocked } from './useMicBlocked';

/**
 * 원격 참가자 한 명의 미디어 상태.
 */
export interface RemoteMedia {
  streamManager: StreamManager;
  /** 이 스트림이 속한 커넥션. 재입장 시 이전(유령) 커넥션의 늦은 이벤트를 구분하는 키 */
  connectionId: string;
  audioActive: boolean;
  videoActive: boolean;
}

export interface OpenViduSessionApi {
  isConnected: boolean;
  localStream: MediaStream | null;
  remoteStreams: ReadonlyMap<number, RemoteMedia>;
  replaceAudioTrack: (track: MediaStreamTrack | null) => Promise<void>;
}

const MUSIC_AUDIO_MAX_BITRATE = 128_000;
/** Strict Mode mount→cleanup→remount 사이클이 끝난 뒤 연결한다 */
const CONNECT_DELAY_MS = 200;

let connectGeneration = 0;

function tuneAudioSender(publisher: Publisher, track: MediaStreamTrack) {
  try {
    const senders = publisher.stream.getRTCPeerConnection().getSenders();
    const sender = senders.find((candidate) => candidate.track === track);
    if (sender === undefined) return;

    const parameters = sender.getParameters();
    const encodings = parameters.encodings.length > 0 ? parameters.encodings : [{}];
    encodings[0].maxBitrate = MUSIC_AUDIO_MAX_BITRATE;
    sender.setParameters({ ...parameters, encodings }).catch(() => undefined);
  } catch {
    // ignore
  }
}

function parseParticipantId(connectionData: string | undefined): number | null {
  if (!connectionData) {
    return null;
  }

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
      // ignore
    }
  }

  return null;
}

function stopPublisher(publisher: Publisher | null) {
  publisher?.stream.getMediaStream()?.getTracks().forEach((track) => track.stop());
}

async function acquireMicrophoneTrack(): Promise<MediaStreamTrack | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return stream.getAudioTracks()[0] ?? null;
  } catch {
    return null;
  }
}

type OpenViduSessionHandlers = Session & {
  onParticipantEvicted: (event: { connectionId: string; reason?: string }) => void;
  onParticipantLeft: (event: { connectionId: string; reason?: string }) => void;
  onParticipantUnpublished: (event: { connectionId: string; reason?: string }) => void;
};

/** 재접속·teardown 직후 SDK가 모르는 connection 이벤트를 처리하다 터지는 것을 막는다 */
function guardStaleOpenViduHandlers(session: Session): void {
  const handlers = session as OpenViduSessionHandlers;

  const originalEvicted = handlers.onParticipantEvicted.bind(session);
  handlers.onParticipantEvicted = (event) => {
    if (!session.connection) {
      return;
    }

    try {
      originalEvicted(event);
    } catch {
      // ignore stale evict
    }
  };

  const originalLeft = handlers.onParticipantLeft.bind(session);
  handlers.onParticipantLeft = (event) => {
    const connectionId = event.connectionId;
    if (!connectionId || !session.remoteConnections.has(connectionId)) {
      // 재접속 시 서버가 끊은 이전 connection의 leave 이벤트 — 이 세션에는 없음
      return;
    }

    try {
      originalLeft(event);
    } catch {
      // ignore stale leave
    }
  };

  const originalUnpublished = handlers.onParticipantUnpublished.bind(session);
  handlers.onParticipantUnpublished = (event) => {
    const connectionId = event.connectionId;
    if (!connectionId) {
      return;
    }

    if (!session.connection) {
      return;
    }

    if (connectionId !== session.connection.connectionId && !session.remoteConnections.has(connectionId)) {
      return;
    }

    try {
      originalUnpublished(event);
    } catch {
      // ignore stale unpublish
    }
  };
}

function disconnectSessionAsync(session: Session | null, publisher: Publisher | null): Promise<void> {
  stopPublisher(publisher);

  if (session === null || !session.connection) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    session.on('sessionDisconnected', finish);

    try {
      session.disconnect();
    } catch {
      finish();
      return;
    }

    window.setTimeout(finish, 400);
  });
}

/** roomId별 이전 OpenVidu teardown — Strict Mode remount 시 connect 레이스 방지 */
const roomTeardowns = new Map<number, Promise<void>>();

function isRemoteConnectionActive(session: Session, connection: Connection | undefined): boolean {
  const connectionId = connection?.connectionId;
  if (!connectionId) {
    return false;
  }

  return session.remoteConnections.has(connectionId);
}

export function useOpenViduSession(): OpenViduSessionApi {
  const roomId = useRoomStore((state) => state.session?.roomId ?? null);
  const micOn = useStageStore((state) => state.micOn);
  const camOn = useStageStore((state) => state.camOn);
  // 공연 중 가창자 외 송출 차단. 토글 상태와 곱해져 실제 송출 여부가 된다
  const micBlocked = useMicBlocked();

  const [isConnected, setIsConnected] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<ReadonlyMap<number, RemoteMedia>>(new Map());
  const publisherRef = useRef<Publisher | null>(null);
  const isBroadcastingMixRef = useRef(false);
  const originalAudioTrackRef = useRef<MediaStreamTrack | null>(null);

  useEffect(() => {
    if (roomId === null) {
      return;
    }

    const generation = ++connectGeneration;
    let cancelled = false;
    let activeSession: Session | null = null;
    let activePublisher: Publisher | null = null;
    let connectTimer: number | null = null;

    const isStale = () => cancelled || generation !== connectGeneration;

    const updateRemote = (participantId: number, media: RemoteMedia | null) => {
      if (isStale()) {
        return;
      }

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

    // 종료 이벤트를 보낸 커넥션이 지금 보관 중인 스트림의 커넥션일 때만 지운다 —
    // 재입장 직후 이전(유령) 커넥션의 늦은 종료 이벤트가 새 스트림을 지우는 것을 막는다.
    const removeRemote = (participantId: number, connectionId: string | undefined) => {
      if (isStale() || connectionId === undefined) {
        return;
      }

      setRemoteStreams((previous) => {
        const current = previous.get(participantId);
        if (current === undefined || current.connectionId !== connectionId) {
          return previous;
        }

        const next = new Map(previous);
        next.delete(participantId);
        return next;
      });
    };

    const connect = async () => {
      setRemoteStreams(new Map());
      setLocalStream(null);
      setIsConnected(false);

      const pendingTeardown = roomTeardowns.get(roomId);
      if (pendingTeardown) {
        await pendingTeardown;
      }
      if (isStale()) {
        return;
      }

      const openviduToken = await fetchMediaToken(roomId);
      if (isStale()) {
        return;
      }

      useRoomStore.getState().setOpenViduToken(openviduToken);

      const { OpenVidu } = await import('openvidu-browser');
      if (isStale()) {
        return;
      }

      const openVidu = new OpenVidu();
      openVidu.enableProdMode();
      const session = openVidu.initSession();
      guardStaleOpenViduHandlers(session);
      const myParticipantId = useRoomStore.getState().session?.myParticipantId ?? null;

      session.on('streamCreated', (event) => {
        if (isStale()) {
          return;
        }

        try {
          const connection = event.stream.connection;
          if (!isRemoteConnectionActive(session, connection)) {
            return;
          }

          const participantId = parseParticipantId(connection?.data);
          if (participantId === null || participantId === myParticipantId) {
            return;
          }

          const subscriber = session.subscribe(event.stream, undefined);
          updateRemote(participantId, {
            streamManager: subscriber,
            connectionId: connection.connectionId,
            audioActive: event.stream.audioActive,
            videoActive: event.stream.videoActive,
          });
        } catch {
          // evict 직후 stale stream 이벤트는 무시
        }
      });

      session.on('streamDestroyed', (event) => {
        const connection = event.stream.connection;
        const participantId = parseParticipantId(connection?.data);
        if (participantId !== null) {
          removeRemote(participantId, connection?.connectionId);
        }
      });

      session.on('connectionDestroyed', (event) => {
        const participantId = parseParticipantId(event.connection?.data);
        if (participantId !== null) {
          removeRemote(participantId, event.connection?.connectionId);
        }
      });

      session.on('streamPropertyChanged', (event) => {
        if (isStale()) {
          return;
        }

        if (event.changedProperty !== 'audioActive' && event.changedProperty !== 'videoActive') {
          return;
        }

        const participantId = parseParticipantId(event.stream.connection?.data);
        if (participantId === null) {
          return;
        }

        setRemoteStreams((previous) => {
          const current = previous.get(participantId);
          // 유령 커넥션의 늦은 토글 이벤트가 새 스트림 상태를 덮어쓰지 않게 커넥션까지 맞춘다
          if (current === undefined || current.connectionId !== event.stream.connection?.connectionId) {
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

      session.on('sessionDisconnected', () => {
        if (isStale()) {
          return;
        }

        setIsConnected(false);
        setLocalStream(null);
        setRemoteStreams(new Map());
      });

      await session.connect(openviduToken);
      if (isStale()) {
        await disconnectSessionAsync(session, null);
        return;
      }

      activeSession = session;
      setIsConnected(true);

      try {
        const publisher = await openVidu.initPublisherAsync(undefined, {
          // 공연 도중 입장·재접속이면 처음부터 막힌 채로 시작한다
          publishAudio: useStageStore.getState().micOn && !readMicBlocked(),
          publishVideo: useStageStore.getState().camOn,
          mirror: false,
        });

        if (isStale()) {
          stopPublisher(publisher);
          await disconnectSessionAsync(session, null);
          return;
        }

        await session.publish(publisher);
        activePublisher = publisher;
        publisherRef.current = publisher;
        setLocalStream(publisher.stream.getMediaStream());
      } catch {
        if (!isStale()) {
          showToast('카메라와 마이크를 쓸 수 없어 시청만 할 수 있어요.', 'info');
        }
      }
    };

    connectTimer = window.setTimeout(() => {
      connect().catch(() => {
        if (!isStale()) {
          showToast('화상 연결에 실패했어요. 잠시 후 다시 시도해 주세요.', 'error');
        }
      });
    }, CONNECT_DELAY_MS);

    return () => {
      cancelled = true;
      if (connectTimer !== null) {
        window.clearTimeout(connectTimer);
      }
      publisherRef.current = null;
      isBroadcastingMixRef.current = false;
      // 원복용 clone은 publisher 스트림 밖에 있어 stopPublisher가 못 멈춘다 — 여기서 끊지 않으면 마이크 점유가 남는다
      originalAudioTrackRef.current?.stop();
      originalAudioTrackRef.current = null;

      const teardown = disconnectSessionAsync(activeSession, activePublisher);
      roomTeardowns.set(roomId, teardown);
      teardown.finally(() => {
        if (roomTeardowns.get(roomId) === teardown) {
          roomTeardowns.delete(roomId);
        }
      });

      activeSession = null;
      activePublisher = null;
      setIsConnected(false);
      setLocalStream(null);
      setRemoteStreams(new Map());
    };
  }, [roomId]);

  useEffect(() => {
    if (isBroadcastingMixRef.current) return;
    publisherRef.current?.publishAudio(micOn && !micBlocked);
  }, [micOn, micBlocked]);

  useEffect(() => {
    publisherRef.current?.publishVideo(camOn);
  }, [camOn]);

  const replaceAudioTrack = useCallback(async (track: MediaStreamTrack | null) => {
    const publisher = publisherRef.current;
    if (publisher === null) return;

    if (track !== null) {
      if (originalAudioTrackRef.current === null) {
        // replaceTrack은 교체되는 기존 트랙을 stop시킨다(SDK 내부 동작) — 원본은 clone으로 보관해야 살아남는다
        const current = publisher.stream.getMediaStream()?.getAudioTracks()[0] ?? null;
        originalAudioTrackRef.current =
          current !== null && current.readyState === 'live' ? current.clone() : null;
      }
      await publisher.replaceTrack(track);
      isBroadcastingMixRef.current = true;
      publisher.publishAudio(true);
      tuneAudioSender(publisher, track);
      return;
    }

    isBroadcastingMixRef.current = false;
    let original = originalAudioTrackRef.current;
    originalAudioTrackRef.current = null;
    if (original !== null && original.readyState !== 'live') {
      original.stop();
      original = null;
    }
    if (original === null) {
      // 보관한 원본이 없거나 죽어 있으면 마이크를 재획득한다 — 조용히 무음으로 방치하지 않는다
      original = await acquireMicrophoneTrack();
    }
    if (original !== null) {
      try {
        await publisher.replaceTrack(original);
      } catch {
        original.stop();
        original = null;
      }
    }
    if (original === null) {
      showToast('마이크를 다시 연결하지 못했어요. 새로고침해 주세요.', 'error');
    }
    publisher.publishAudio(useStageStore.getState().micOn && !readMicBlocked());
  }, []);

  return { isConnected, localStream, remoteStreams, replaceAudioTrack };
}
