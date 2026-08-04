'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Connection, Publisher, Session, StreamManager } from 'openvidu-browser';

import { useRoomStore } from '@/entities/room';
import { showToast } from '@/shared/model/toastStore';

import { fetchMediaToken } from './openViduMediaToken';
import { useStageStore } from './stageStore';

/**
 * 원격 참가자 한 명의 미디어 상태.
 */
export interface RemoteMedia {
  streamManager: StreamManager;
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
            audioActive: event.stream.audioActive,
            videoActive: event.stream.videoActive,
          });
        } catch {
          // evict 직후 stale stream 이벤트는 무시
        }
      });

      session.on('streamDestroyed', (event) => {
        if (isStale()) {
          return;
        }

        const participantId = parseParticipantId(event.stream.connection?.data);
        if (participantId !== null) {
          updateRemote(participantId, null);
        }
      });

      session.on('connectionDestroyed', (event) => {
        if (isStale()) {
          return;
        }

        const participantId = parseParticipantId(event.connection?.data);
        if (participantId !== null) {
          updateRemote(participantId, null);
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
          publishAudio: useStageStore.getState().micOn,
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
          showToast('카메라·마이크를 사용할 수 없어 시청 전용으로 참여합니다.', 'info');
        }
      }
    };

    connectTimer = window.setTimeout(() => {
      connect().catch(() => {
        if (!isStale()) {
          showToast('미디어 서버 연결에 실패했습니다.', 'error');
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
    publisherRef.current?.publishAudio(micOn);
  }, [micOn]);

  useEffect(() => {
    publisherRef.current?.publishVideo(camOn);
  }, [camOn]);

  const replaceAudioTrack = useCallback(async (track: MediaStreamTrack | null) => {
    const publisher = publisherRef.current;
    if (publisher === null) return;

    if (track !== null) {
      if (originalAudioTrackRef.current === null) {
        originalAudioTrackRef.current =
          publisher.stream.getMediaStream()?.getAudioTracks()[0] ?? null;
      }
      await publisher.replaceTrack(track);
      isBroadcastingMixRef.current = true;
      publisher.publishAudio(true);
      tuneAudioSender(publisher, track);
      return;
    }

    isBroadcastingMixRef.current = false;
    const original = originalAudioTrackRef.current;
    originalAudioTrackRef.current = null;
    if (original !== null && original.readyState === 'live') {
      await publisher.replaceTrack(original);
    }
    publisher.publishAudio(useStageStore.getState().micOn);
  }, []);

  return { isConnected, localStream, remoteStreams, replaceAudioTrack };
}
