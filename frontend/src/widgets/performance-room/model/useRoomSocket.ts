'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  cardTierFromDuration,
  type CardActivationCancelledPayload,
  type CardActivationScheduledPayload,
  type CardAssignedPayload,
  type CardEffectEndedPayload,
  type CardEffectStartedPayload,
} from '@/entities/card';
import type {
  LeaderboardUpdatedPayload,
  PerformanceCancelledPayload,
  PerformancePreparationStartedPayload,
  PerformanceSettings,
  PerformanceSettingsChangedPayload,
  PerformanceStartedPayload,
} from '@/entities/performance';
import {
  getRoomSnapshot,
  useRoomStore,
  type ParticipantConnectionStatusChangedPayload,
  type ParticipantJoinedPayload,
  type ParticipantKickedPayload,
  type ParticipantLeftPayload,
  type PerformerSelectedPayload,
  type PongPayload,
  type RoomHostChangedPayload,
  type RoomWebSocketEvent,
  type WebSocketErrorEvent,
} from '@/entities/room';
import { createStompClient, subscribeJson } from '@/shared/api/stomp';
import { showToast } from '@/shared/model/toastStore';

import { hydrateCardsFromRoomSnapshot, useCardStore } from './cardStore';
import { useStageStore } from './stageStore';

/** 연결 상태 확인 PING 전송 주기 (백엔드 하트비트 10초와 동일) */
const PING_INTERVAL_MS = 10_000;

export interface RoomSocketApi {
  isConnected: boolean;
  /** 최근 PING-PONG 왕복 지연(ms). 아직 PONG을 받지 못했으면 null */
  latencyMs: number | null;
  /** 연결 상태 확인 PING을 즉시 전송한다 */
  sendPing: () => void;
  /** 곡을 확정하고 공연 준비를 요청한다 (가창자 전용) */
  sendPrepare: (songId: number) => void;
  /** 음원 재생 시작을 알린다 (가창자 전용) */
  sendPlaybackStart: () => void;
  /** 음원 재생 정상 종료를 알린다 (가창자 전용) */
  sendPlaybackFinish: () => void;
  /** 공연 설정(키/템포/볼륨/이펙트) 변경 (가창자 전용) */
  sendSettings: (settings: PerformanceSettings) => void;
  /** 진행 중인 공연을 취소한다 (가창자 전용) */
  sendCancel: () => void;
  /** 수성전: 내게 배정된 공격 카드를 발동한다 (공격자 전용) */
  sendCardActivate: () => void;
}

/**
 * 방 입장 후 STOMP 연결을 맺고, 방 브로드캐스트/개인 큐 이벤트를
 * roomStore·stageStore에 반영한다.
 */
export function useRoomSocket(roomId: number | null): RoomSocketApi {
  const [isConnected, setIsConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const clientRef = useRef<ReturnType<typeof createStompClient> | null>(null);

  useEffect(() => {
    if (roomId === null) {
      return;
    }

    let pingInterval: ReturnType<typeof setInterval> | null = null;

    const stopPing = () => {
      if (pingInterval !== null) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    };

    const handleEvent = (event: RoomWebSocketEvent) => {
      const roomStore = useRoomStore.getState();
      const stageStore = useStageStore.getState();
      const cardStore = useCardStore.getState();

      switch (event.eventType) {
        // ── Room ──
        case 'PARTICIPANT_JOINED':
          // payload에 userId가 없어(명세: participantId·nickname뿐) 목록에 바로 반영하면
          // userId 기반 비교(캠 그리드 필터 등)가 깨진다. 즉시 반영 후 스냅샷으로 보정한다.
          roomStore.applyParticipantJoined(event.payload as ParticipantJoinedPayload);
          getRoomSnapshot(event.roomId ?? roomId)
            .then((snapshot) => {
              useRoomStore.getState().hydrateFromSnapshot(snapshot);
              hydrateCardsFromRoomSnapshot(snapshot);
            })
            .catch(() => {
              // 조회 실패 시 즉시 반영된 목록이라도 유지한다.
            });
          break;
        case 'PARTICIPANT_LEFT':
          roomStore.applyParticipantLeft(event.payload as ParticipantLeftPayload);
          break;
        case 'PARTICIPANT_KICKED':
          roomStore.applyParticipantKicked(event.payload as ParticipantKickedPayload);
          break;
        case 'ROOM_HOST_CHANGED':
          roomStore.applyHostChanged(event.payload as RoomHostChangedPayload);
          break;
        case 'PARTICIPANT_CONNECTION_STATUS_CHANGED':
          roomStore.applyConnectionStatusChanged(
            event.payload as ParticipantConnectionStatusChangedPayload,
          );
          break;
        // ── Performance ──
        case 'PERFORMER_SELECTED':
          // 서버가 가창자 역할을 승격했다. 모든 참가자가 선곡 단계로 전이한다.
          stageStore.confirmSinger((event.payload as PerformerSelectedPayload).performerId);
          break;
        case 'PERFORMANCE_STARTED':
          stageStore.applyPerformanceStarted(event.payload as PerformanceStartedPayload);
          break;
        case 'PERFORMANCE_PREPARATION_STARTED':
          stageStore.applyPreparationStarted(
            event.payload as PerformancePreparationStartedPayload,
          );
          break;
        case 'PLAYBACK_STARTED':
          stageStore.applyPlaybackStarted();
          // 수성전: 노래 시작 시점에 가창자를 제외한 온라인 참가자 전원에게 카드가 배정된다.
          // 타인의 카드 내용은 개인 큐로만 전달되므로, 보유 여부만 여기서 시드한다.
          if (roomStore.session?.mode === 'BATTLE') {
            cardStore.seedCardHolders(
              roomStore.participants
                .filter(
                  (participant) =>
                    participant.connectionStatus === 'CONNECTED' &&
                    participant.id !== stageStore.performerParticipantId,
                )
                .map((participant) => participant.id),
            );
          }
          break;
        case 'PLAYBACK_FINISHED':
          stageStore.applyPlaybackFinished();
          cardStore.resetCards();
          break;
        case 'PERFORMANCE_SETTINGS_CHANGED':
          stageStore.applySettingsChanged(
            (event.payload as PerformanceSettingsChangedPayload).settings,
          );
          break;
        case 'PERFORMANCE_CANCELLED': {
          const payload = event.payload as PerformanceCancelledPayload;
          stageStore.applyPerformanceCancelled();
          cardStore.resetCards();
          if (payload.cancelReason !== 'PERFORMER_REQUEST') {
            showToast('공연이 중단되었습니다.', 'error');
          }
          break;
        }
        // ── Card (수성전) ──
        case 'CARD_ASSIGNED': {
          const payload = event.payload as CardAssignedPayload;
          cardStore.applyCardAssigned({
            ...payload,
            // tier가 비어 오는 경우(스냅샷 등) 지속시간으로 등급을 역산한다 (10/15/20초 = S/G/P)
            tier: payload.tier ?? cardTierFromDuration(payload.durationSeconds),
          });
          break;
        }
        case 'CARD_ACTIVATION_SCHEDULED': {
          const payload = event.payload as CardActivationScheduledPayload;
          // 카운트다운은 로컬에서 3초를 새로 세지 않고 서버 시각(activateAt) 기준으로 계산한다.
          cardStore.setClockOffset(new Date(payload.serverNow).getTime() - Date.now());
          cardStore.applyActivationScheduled(payload);
          break;
        }
        case 'CARD_ACTIVATION_CANCELLED':
          cardStore.applyActivationCancelled(event.payload as CardActivationCancelledPayload);
          break;
        case 'CARD_EFFECT_STARTED':
          cardStore.applyEffectStarted(event.payload as CardEffectStartedPayload);
          break;
        case 'CARD_EFFECT_ENDED':
          cardStore.applyEffectEnded(event.payload as CardEffectEndedPayload);
          break;
        case 'PERFORMANCE_STATE_CHANGED':
          // 세부 상태(ANALYZING 등) UI는 추후 확장. 현재는 주요 이벤트로만 전이한다.
          break;
        case 'LEADERBOARD_UPDATED': {
          // 리더보드 저장은 GeneralRoomScreen에서 구독 중인 스토어가 없어
          // 이벤트 발행이 시작되면 roomStore 확장으로 연결한다. (백엔드 미완성)
          void (event.payload as LeaderboardUpdatedPayload);
          break;
        }
        default:
          break;
      }
    };

    const sendPing = () => {
      if (!client.connected) {
        return;
      }
      client.publish({
        destination: `/app/rooms/${roomId}/ping`,
        body: JSON.stringify({ clientSentAt: new Date().toISOString() }),
      });
    };

    const client = createStompClient({
      onConnect: () => {
        setIsConnected(true);

        subscribeJson<RoomWebSocketEvent>(client, `/topic/rooms/${roomId}`, handleEvent);
        subscribeJson<RoomWebSocketEvent>(client, `/user/queue/rooms/${roomId}`, handleEvent);
        // 수성전 개인 카드 배정 큐. 일반전에서는 서버가 발행하지 않는다.
        subscribeJson<RoomWebSocketEvent>(client, '/user/queue/cards', handleEvent);
        subscribeJson<WebSocketErrorEvent>(client, '/user/queue/errors', (event) => {
          showToast(event.payload.message, 'error');
        });
        subscribeJson<RoomWebSocketEvent<PongPayload>>(client, '/user/queue/pong', (event) => {
          const roundTrip = Date.now() - new Date(event.payload.clientSentAt).getTime();
          setLatencyMs(Number.isFinite(roundTrip) && roundTrip >= 0 ? roundTrip : null);
        });

        // 연결 직후 1회 전송 후 주기적으로 연결 상태를 확인한다.
        stopPing();
        sendPing();
        pingInterval = setInterval(sendPing, PING_INTERVAL_MS);
      },
      onDisconnect: () => {
        stopPing();
        setIsConnected(false);
        setLatencyMs(null);
      },
      onStompError: (message) => {
        stopPing();
        setIsConnected(false);
        setLatencyMs(null);
        showToast(message, 'error');
      },
    });

    clientRef.current = client;
    client.activate();

    return () => {
      stopPing();
      clientRef.current = null;
      setIsConnected(false);
      setLatencyMs(null);
      void client.deactivate();
    };
  }, [roomId]);

  return useMemo<RoomSocketApi>(() => {
    const publish = (destination: string, body?: unknown) => {
      const client = clientRef.current;

      if (!client || !client.connected) {
        showToast('서버와 연결되어 있지 않습니다.', 'error');
        return;
      }

      client.publish({
        destination,
        body: body === undefined ? '' : JSON.stringify(body),
      });
    };

    const currentPerformanceId = () => useStageStore.getState().performanceId;

    return {
      isConnected,
      latencyMs,
      sendPing: () => {
        if (roomId === null) return;
        publish(`/app/rooms/${roomId}/ping`, { clientSentAt: new Date().toISOString() });
      },
      sendPrepare: (songId) => {
        if (roomId === null) return;
        publish(`/app/rooms/${roomId}/performance/prepare`, { songId });
      },
      sendPlaybackStart: () => {
        const performanceId = currentPerformanceId();
        if (roomId === null || performanceId === null) return;
        publish(`/app/rooms/${roomId}/performances/${performanceId}/playback/start`);
      },
      sendPlaybackFinish: () => {
        const performanceId = currentPerformanceId();
        if (roomId === null || performanceId === null) return;
        publish(`/app/rooms/${roomId}/performances/${performanceId}/playback/finish`);
      },
      sendSettings: (settings) => {
        const performanceId = currentPerformanceId();
        if (roomId === null || performanceId === null) return;
        publish(`/app/rooms/${roomId}/performances/${performanceId}/settings`, settings);
      },
      sendCancel: () => {
        const performanceId = currentPerformanceId();
        if (roomId === null || performanceId === null) return;
        publish(`/app/rooms/${roomId}/performances/${performanceId}/cancel`);
      },
      sendCardActivate: () => {
        const performanceId = currentPerformanceId();
        if (roomId === null || performanceId === null) return;
        // 카드 식별자는 보내지 않는다 — 서버가 인증 사용자 기준으로 배정 카드를 찾는다.
        publish(`/app/rooms/${roomId}/performances/${performanceId}/cards/activate`);
      },
    };
  }, [roomId, isConnected, latencyMs]);
}
