package com.ssafy.ssasukae.domain.performance.service;

import java.time.OffsetDateTime;
import java.time.ZoneId;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ssafy.ssasukae.domain.card.service.CardService;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectEndReason;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.performance.websocket.PerformanceWebSocketEventType;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceResumedPayload;
import com.ssafy.ssasukae.domain.performance.websocket.payload.PerformanceSuspendedPayload;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketBusinessException;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketErrorCode;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class PerformanceConnectionRecoveryService {

  private static final ZoneId SEOUL_ZONE_ID = ZoneId.of("Asia/Seoul");

  private final RoomRepository roomRepository;
  private final RoomParticipantRepository participantRepository;
  private final PerformanceStore performanceStore;
  private final PerformanceTransactionSupport transactionSupport;
  private final PerformanceWebSocketEventPublisher eventPublisher;
  private final CardService cardService;

  @Transactional
  public void suspendForPerformerDisconnect(RoomParticipant participant) {
    if (participant == null || !participant.isPerformer()) {
      return;
    }

    Room room = roomRepository.findByIdForUpdate(participant.getRoom().getId()).orElse(null);
    suspendForPerformerDisconnectWithLockedRoom(room, participant);
  }

  /** 호출자가 동일 트랜잭션에서 Room 쓰기 락을 이미 보유한 경우 사용한다. */
  public void suspendForPerformerDisconnectWithLockedRoom(Room room, RoomParticipant participant) {
    if (participant == null || !participant.isPerformer()) {
      return;
    }
    if (room == null || room.getStatus() != RoomStatus.PLAYING) {
      return;
    }

    PerformanceSnapShot previous = performanceStore.findActiveByRoomId(room.getId()).orElse(null);
    if (previous == null
        || !previous.isPerformedBy(participant.getId())
        || (previous.status() != PerformanceStatus.PREPARING
            && previous.status() != PerformanceStatus.PLAYING)) {
      return;
    }

    PerformanceSnapShot cardRestored =
        cardService.suspendForPerformance(previous, CardEffectEndReason.PERFORMER_DISCONNECTED);
    OffsetDateTime suspendedAt = now();
    PerformanceSnapShot suspended = cardRestored.suspendForPerformerDisconnect(suspendedAt);
    transactionSupport.saveWithRollback(previous, suspended);
    transactionSupport.afterCommit(
        () ->
            eventPublisher.publish(
                room.getId(),
                PerformanceWebSocketEventType.PERFORMANCE_SUSPENDED,
                new PerformanceSuspendedPayload(
                    suspended.performanceId(),
                    suspended.performerParticipantId(),
                    suspended.suspendedFromStatus(),
                    suspended.status(),
                    suspended.suspendedAt(),
                    suspended.playbackPositionMs())));
  }

  @Transactional
  public void resumeAfterPerformerReady(Long userId, Long roomId, Long performanceId) {
    Room room =
        roomRepository
            .findByIdForUpdate(roomId)
            .orElseThrow(() -> business(WebSocketErrorCode.RESOURCE_NOT_FOUND));
    if (room.getStatus() != RoomStatus.PLAYING) {
      throw business(WebSocketErrorCode.INVALID_ROOM_STATE);
    }

    RoomParticipant participant =
        participantRepository
            .findByRoomIdAndUserId(roomId, userId)
            .orElseThrow(() -> business(WebSocketErrorCode.ROOM_ACCESS_DENIED));
    if (!participant.isOnline() || !participant.isPerformer()) {
      throw business(WebSocketErrorCode.PERFORMER_PERMISSION_REQUIRED);
    }

    PerformanceSnapShot suspended =
        performanceStore
            .findByPerformanceId(performanceId)
            .orElseThrow(() -> business(WebSocketErrorCode.RESOURCE_NOT_FOUND));
    if (!suspended.belongsToRoom(roomId) || !suspended.isPerformedBy(participant.getId())) {
      throw business(WebSocketErrorCode.INVALID_PERFORMANCE_STATE);
    }
    if (suspended.status() == PerformanceStatus.PREPARING
        || suspended.status() == PerformanceStatus.PLAYING) {
      return;
    }
    if (suspended.status() != PerformanceStatus.SUSPENDED) {
      throw business(WebSocketErrorCode.INVALID_PERFORMANCE_STATE);
    }

    OffsetDateTime resumeAt = now();
    PerformanceSnapShot resumed = suspended.resumeAfterPerformerReconnect(resumeAt);
    transactionSupport.saveWithRollback(suspended, resumed);
    transactionSupport.afterCommit(
        () ->
            eventPublisher.publish(
                roomId,
                PerformanceWebSocketEventType.PERFORMANCE_RESUMED,
                new PerformanceResumedPayload(
                    resumed.performanceId(),
                    resumed.performerParticipantId(),
                    PerformanceStatus.SUSPENDED,
                    resumed.status(),
                    resumeAt,
                    resumed.playbackPositionAt(resumeAt),
                    resumed.settings())));
  }

  private OffsetDateTime now() {
    return OffsetDateTime.now(SEOUL_ZONE_ID);
  }

  private WebSocketBusinessException business(WebSocketErrorCode code) {
    return new WebSocketBusinessException(code);
  }
}
