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
  PerformanceResumedPayload,
  PerformanceSettings,
  PerformanceSettingsChangedPayload,
  PerformanceStartedPayload,
  PerformanceStateChangedPayload,
  PerformanceSuspendedPayload,
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
  type RoomParticipantChatPayload,
  type RoomWebSocketEvent,
  type WebSocketErrorEvent,
} from '@/entities/room';
import { toUserFacingMessage } from '@/shared/api/errorResponse';
import { createStompClient, subscribeJson } from '@/shared/api/stomp';
import { showToast } from '@/shared/model/toastStore';

import { hydrateCardsFromRoomSnapshot, useCardStore } from './cardStore';
import { useChatStore } from './chatStore';
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
  /** 일시 중지된 공연을 재개할 준비가 됐음을 알린다 (가창자 전용) */
  sendResumeReady: () => void;
  /** 방 채팅 메시지를 전송한다 (300자 이하) */
  sendChat: (message: string) => void;
  /** 방장을 다른 참가자에게 위임한다 (방장 전용) */
  sendHostChange: (participantId: number) => void;
  /** 참가자를 강제 퇴장시킨다 (방장 전용) */
  sendKick: (participantId: number) => void;
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

      // 강퇴·방 종료로 방을 떠날 때의 공통 정리. 세션이 비면
      // PerformanceRoomScreen의 세션 감시 효과가 로비로 되돌린다.
      const exitRoom = () => {
        stageStore.endStage();
        cardStore.resetCards();
        useChatStore.getState().resetChat();
        roomStore.leaveRoom();
      };

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
        case 'PARTICIPANT_KICKED': {
          const payload = event.payload as ParticipantKickedPayload;
          if (payload.participantId === roomStore.session?.myParticipantId) {
            showToast('방장이 방에서 내보냈어요.', 'error');
            exitRoom();
            break;
          }
          roomStore.applyParticipantKicked(payload);
          break;
        }
        case 'ROOM_HOST_CHANGED': {
          const payload = event.payload as RoomHostChangedPayload;
          const wasHost = roomStore.session?.isHost ?? false;
          roomStore.applyHostChanged(payload);
          if (!wasHost && payload.participantId === roomStore.session?.myParticipantId) {
            showToast('방장이 되었어요.', 'info');
          }
          break;
        }
        case 'ROOM_TERMINATED':
          // 종료를 직접 요청한 방장은 이미 로컬 정리를 마쳐 세션이 없다.
          if (roomStore.session !== null) {
            showToast('방장이 방을 종료했어요.', 'info');
            exitRoom();
          }
          break;
        case 'PARTICIPANT_CHAT':
          useChatStore
            .getState()
            .appendMessage(event.payload as RoomParticipantChatPayload);
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
          // 이벤트에는 곡 제목만 있어 가사 싱크 조회에 필요한 가수·길이가 없다.
          // 선곡한 가창자는 이미 알고 있지만 나머지 참가자는 스냅샷으로만 알 수 있다.
          getRoomSnapshot(event.roomId ?? roomId)
            .then((snapshot) => {
              useStageStore.getState().hydrateFromRoomSnapshot(snapshot);
            })
            .catch(() => {
              // 가수·길이 없이도 제목만으로 가사를 찾는다 (정확도만 떨어진다).
            });
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
          // 가창자가 재생 시작 전에 취소한 것은 노래 바꾸기다 — 가창자를 유지한 채
          // 선곡 단계로 돌아간다. 그 외(공연 중 취소·연결 끊김 중단)는 무대를 처음부터 시작한다.
          if (
            payload.cancelReason === 'PERFORMER_REQUEST' &&
            payload.previousPerformanceStatus === 'PREPARING'
          ) {
            stageStore.applySongChangeCancelled(payload.performerParticipantId);
          } else {
            stageStore.applyPerformanceCancelled();
          }
          cardStore.resetCards();
          if (payload.cancelReason !== 'PERFORMER_REQUEST') {
            showToast('공연이 중단됐어요.', 'error');
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
        case 'PERFORMANCE_STATE_CHANGED': {
          const payload = event.payload as PerformanceStateChangedPayload;
          if (
            payload.currentStatus === 'ANALYSIS_FAILED' &&
            payload.performanceId === stageStore.performanceId
          ) {
            stageStore.applyScoringFailed();
            showToast('채점하지 못했어요.', 'error');
          }
          // FINISHED 전이는 점수를 담은 LEADERBOARD_UPDATED가 함께 오므로 여기선 처리하지 않는다.
          break;
        }
        case 'LEADERBOARD_UPDATED': {
          const payload = event.payload as LeaderboardUpdatedPayload;
          roomStore.applyLeaderboardUpdated(payload);
          if (payload.updatedPerformanceId === stageStore.performanceId) {
            stageStore.applyScore(payload.updatedFinalScore);
          }
          break;
        }
        case 'PERFORMANCE_SUSPENDED':
          stageStore.applyPerformanceSuspended(event.payload as PerformanceSuspendedPayload);
          showToast('가창자 연결이 끊겨 공연을 잠시 멈췄어요.', 'info');
          break;
        case 'PERFORMANCE_RESUMED':
          stageStore.applyPerformanceResumed(event.payload as PerformanceResumedPayload);
          showToast('공연을 다시 시작했어요.', 'info');
          break;
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
        // 수성전 개인 카드 배정 큐. 일반전에서는 서버가 발행하지 않는다.
        subscribeJson<RoomWebSocketEvent>(client, '/user/queue/cards', handleEvent);
        subscribeJson<WebSocketErrorEvent>(client, '/user/queue/errors', (event) => {
          showToast(
            toUserFacingMessage(event.payload.message, '요청을 처리하지 못했어요.'),
            'error',
          );
        });
        subscribeJson<RoomWebSocketEvent<PongPayload>>(client, '/user/queue/pong', (event) => {
          const roundTrip = Date.now() - new Date(event.payload.clientSentAt).getTime();
          setLatencyMs(Number.isFinite(roundTrip) && roundTrip >= 0 ? roundTrip : null);
        });

        // 구독을 먼저 연 뒤 현재 상태를 조회해 초기 연결·재연결 사이에 놓친 공연 이벤트를 복구한다.
        getRoomSnapshot(roomId)
          .then((snapshot) => {
            useRoomStore.getState().hydrateFromSnapshot(snapshot);
            useStageStore.getState().hydrateFromRoomSnapshot(snapshot);
            hydrateCardsFromRoomSnapshot(snapshot);
          })
          .catch(() => {
            // 주 화면의 오류 처리와 다음 재연결에 맡긴다.
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
      onStompError: (brokerMessage) => {
        stopPing();
        setIsConnected(false);
        setLatencyMs(null);
        showToast(
          toUserFacingMessage(
            brokerMessage,
            '서버 연결이 끊어졌어요. 잠시 후 다시 시도해 주세요.',
          ),
          'error',
        );
      },
    });

    clientRef.current = client;
    client.activate();

    return () => {
      stopPing();
      clientRef.current = null;
      setIsConnected(false);
      setLatencyMs(null);
      useChatStore.getState().resetChat();
      void client.deactivate();
    };
  }, [roomId]);

  return useMemo<RoomSocketApi>(() => {
    const publish = (destination: string, body?: unknown) => {
      const client = clientRef.current;

      if (!client || !client.connected) {
        showToast('서버와 연결되어 있지 않아요.', 'error');
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
        // 서버 요청 DTO는 4필드 record라 로컬 전용 필드(micVolumePercent 등)가 섞이면
        // 역직렬화에서 거부된다(서버 내부 오류). 계약에 있는 필드만 추려 보낸다.
        publish(`/app/rooms/${roomId}/performances/${performanceId}/settings`, {
          keyOffset: settings.keyOffset,
          tempoPercent: settings.tempoPercent,
          mrVolumePercent: settings.mrVolumePercent,
          echoLevel: settings.echoLevel,
        });
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
      sendResumeReady: () => {
        const performanceId = currentPerformanceId();
        if (roomId === null || performanceId === null) return;
        publish(`/app/rooms/${roomId}/performances/${performanceId}/resume-ready`);
      },
      sendChat: (message) => {
        if (roomId === null) return;
        publish(`/app/rooms/${roomId}/chat`, { message });
      },
      sendHostChange: (participantId) => {
        if (roomId === null) return;
        publish(`/app/rooms/${roomId}/host-changed`, { participantId });
      },
      sendKick: (participantId) => {
        if (roomId === null) return;
        publish(`/app/rooms/${roomId}/participants/${participantId}/kick`);
      },
    };
  }, [roomId, isConnected, latencyMs]);
}
