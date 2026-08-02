package com.ssafy.ssasukae.domain.card.service;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ssafy.ssasukae.domain.card.entity.Card;
import com.ssafy.ssasukae.domain.card.redis.CardAssignmentSnapshot;
import com.ssafy.ssasukae.domain.card.redis.CardAssignmentStatus;
import com.ssafy.ssasukae.domain.card.redis.CardStateStore;
import com.ssafy.ssasukae.domain.card.redis.RoomCardSnapshot;
import com.ssafy.ssasukae.domain.card.redis.RoomCardStatus;
import com.ssafy.ssasukae.domain.card.repository.CardRepository;
import com.ssafy.ssasukae.domain.card.type.CardTier;
import com.ssafy.ssasukae.domain.card.websocket.CardWebSocketEventPublisher;
import com.ssafy.ssasukae.domain.card.websocket.CardWebSocketEventType;
import com.ssafy.ssasukae.domain.card.websocket.payload.CardActivationCancelledPayload;
import com.ssafy.ssasukae.domain.card.websocket.payload.CardActivationScheduledPayload;
import com.ssafy.ssasukae.domain.card.websocket.payload.CardAssignedPayload;
import com.ssafy.ssasukae.domain.card.websocket.payload.CardEffectEndedPayload;
import com.ssafy.ssasukae.domain.card.websocket.payload.CardEffectStartedPayload;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectEndReason;
import com.ssafy.ssasukae.domain.card.websocket.type.CardEffectType;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSettings;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketBusinessException;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketErrorCode;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class CardService {

  private static final ZoneId SEOUL_ZONE_ID = ZoneId.of("Asia/Seoul");
  private static final int ACTIVATION_COUNTDOWN_SECONDS = 3;
  private static final long MINIMUM_REMAINING_PLAYBACK_MS = 3_000L;
  private static final int TEMPO_PERCENT_PER_STEP = 5;

  private final RoomRepository roomRepository;
  private final RoomParticipantRepository participantRepository;
  private final CardRepository cardRepository;
  private final PerformanceStore performanceStore;
  private final CardStateStore cardStateStore;
  private final CardWebSocketEventPublisher eventPublisher;
  private final TaskScheduler taskScheduler;
  private final Clock clock;
  private final SecureRandom random = new SecureRandom();

  public CardService(
      RoomRepository roomRepository,
      RoomParticipantRepository participantRepository,
      CardRepository cardRepository,
      PerformanceStore performanceStore,
      CardStateStore cardStateStore,
      CardWebSocketEventPublisher eventPublisher,
      @Qualifier("cardTaskScheduler") TaskScheduler taskScheduler,
      Clock clock) {
    this.roomRepository = roomRepository;
    this.participantRepository = participantRepository;
    this.cardRepository = cardRepository;
    this.performanceStore = performanceStore;
    this.cardStateStore = cardStateStore;
    this.eventPublisher = eventPublisher;
    this.taskScheduler = taskScheduler;
    this.clock = clock;
  }

  // 공연 시작할 때, 공연자 제외 인원들 카드 배정
  @Transactional(readOnly = true)
  public synchronized void assignForPlayback(PerformanceSnapShot performance) {
    try {
      Room room = roomRepository.findById(performance.roomId()).orElse(null);
      if (room == null
          || room.getMode() != RoomMode.BATTLE
          || room.getStatus() != RoomStatus.PLAYING
          || performance.status() != PerformanceStatus.PLAYING) {
        return;
      }

      List<RoomParticipant> recipients =
          participantRepository
              .findAllByRoomIdAndConnectionStatusInOrderByJoinedAtAsc(
                  room.getId(), List.of(ConnectionStatus.CONNECTED))
              .stream()
              .filter(participant -> !performance.isPerformedBy(participant.getId()))
              .toList();
      if (recipients.isEmpty()) {
        return;
      }

      List<Card> drawableCards =
          cardRepository.findAll().stream().filter(Card::isDrawable).toList();
      if (drawableCards.isEmpty()) {
        log.warn(
            "뽑을 카드 없음 (roomId={}, performanceId={})", room.getId(), performance.performanceId());
        return;
      }

      OffsetDateTime assignedAt = now();
      List<CardAssignmentSnapshot> assignments = new ArrayList<>();
      for (RoomParticipant recipient : recipients) {
        Card card = draw(drawableCards);
        CardAssignmentSnapshot cardAssignmentSnapshot =
            toAssignment(room.getId(), performance, recipient, card, assignedAt);
        cardStateStore.saveAssignment(cardAssignmentSnapshot);
        assignments.add(cardAssignmentSnapshot);
      }
      assignments.forEach(this::publishAssigned);
    } catch (RuntimeException exception) {
      log.error(
          "카드 배정 실패 (roomId={}, performanceId={})",
          performance.roomId(),
          performance.performanceId(),
          exception);
    }
  }

  // 카드 활성화
  @Transactional
  public synchronized void activate(Long userId, Long roomId, Long performanceId) {
    validatePositive(userId, "userId");
    validatePositive(roomId, "roomId");
    validatePositive(performanceId, "performanceId");

    // 존재하는 방인가
    Room room =
        roomRepository
            .findByIdForUpdate(roomId)
            .orElseThrow(() -> business(WebSocketErrorCode.RESOURCE_NOT_FOUND));
    // 배틀방인가
    if (room.getMode() != RoomMode.BATTLE) {
      throw business(WebSocketErrorCode.INVALID_ROOM_MODE);
    }
    // 공연중인가
    if (room.getStatus() != RoomStatus.PLAYING) {
      throw business(WebSocketErrorCode.INVALID_ROOM_STATE);
    }

    // 올바른 참가자인가
    RoomParticipant participant =
        participantRepository
            .findByRoomIdAndUserId(roomId, userId)
            .orElseThrow(() -> business(WebSocketErrorCode.ROOM_ACCESS_DENIED));
    if (!participant.isOnline()) {
      throw business(WebSocketErrorCode.PARTICIPANT_OFFLINE);
    }
    // 공연 정보가 스냅샷에 있나
    PerformanceSnapShot performance =
        performanceStore
            .findActiveByRoomId(roomId)
            .orElseThrow(() -> business(WebSocketErrorCode.NO_ACTIVE_PERFORMANCE));
    if (!performance.performanceId().equals(performanceId)) {
      throw business(WebSocketErrorCode.PERFORMANCE_MISMATCH);
    }
    if (performance.status() != PerformanceStatus.PLAYING || performance.startedAt() == null) {
      throw business(WebSocketErrorCode.PLAYBACK_NOT_RUNNING);
    }
    // 공연자인가
    if (performance.isPerformedBy(participant.getId())) {
      throw business(WebSocketErrorCode.PERFORMER_CANNOT_USE_CARD);
    }
    // 대기 시간이 남은 노래 시간보다 더 길면 시작 안함
    OffsetDateTime approvedAt = now();
    if (performance.remainingPlaybackMs(approvedAt) <= MINIMUM_REMAINING_PLAYBACK_MS) {
      throw business(WebSocketErrorCode.INSUFFICIENT_PLAYBACK_TIME);
    }

    // 그 외의 경우에 대해서는 정상 요청으로 간주 -> 카드 발행
    CardAssignmentSnapshot assignment =
        cardStateStore
            .findAssignment(roomId, performanceId, participant.getId())
            .orElseThrow(() -> business(WebSocketErrorCode.CARD_ASSIGNMENT_NOT_FOUND));
    validateAssignment(assignment);

    // 마이크 난입이면, 효과를 카드 사용자 본인한테 적용시켜야함
    Long targetParticipantId =
        assignment.targetType()
                == com.ssafy.ssasukae.domain.card.websocket.type.CardEffectTargetType.CARD_OWNER
            ? participant.getId()
            : performance.performerParticipantId();
    if (targetParticipantId == null) {
      throw business(WebSocketErrorCode.INVALID_CARD_TARGET);
    }

    validateNoRoomCard(roomId);

    // 프론트가 타이머 설정하기 위해서 3초 뒤의 시간을 넘겨줌
    OffsetDateTime activateAt = approvedAt.plusSeconds(ACTIVATION_COUNTDOWN_SECONDS);
    RoomCardSnapshot pendingRoomCard =
        new RoomCardSnapshot(
            roomId,
            performanceId,
            RoomCardStatus.PENDING,
            participant.getId(),
            targetParticipantId,
            assignment.cardId(),
            assignment.cardCode(),
            assignment.cardName(),
            assignment.description(),
            assignment.effectType(),
            assignment.targetType(),
            assignment.effectValue(),
            assignment.durationSeconds(),
            null,
            approvedAt,
            activateAt,
            null,
            null);

    cardStateStore.saveRoomCard(pendingRoomCard);

    // 카드 사용 예정 이벤트 발행 및 activatedAt 시각에 startEffect 메서드 실행
    eventPublisher.publishToRoom(
        roomId,
        CardWebSocketEventType.CARD_ACTIVATION_SCHEDULED,
        scheduledPayload(pendingRoomCard, approvedAt));
    taskScheduler.schedule(
        () -> startEffect(roomId, performanceId, participant.getId()), activateAt.toInstant());
  }

  public synchronized PerformanceSnapShot closeForPerformance(
      PerformanceSnapShot performance, CardEffectEndReason reason) {
    return doCloseForPerformance(performance, reason);
  }

  /**
   * 가창자 재접속을 기다리는 동안 현재 예약/활성 카드만 종료한다.
   * 공연을 재개해야 하므로 아직 사용하지 않은 개인 카드 배정은 유지한다.
   */
  public synchronized PerformanceSnapShot suspendForPerformance(
      PerformanceSnapShot performance, CardEffectEndReason reason) {
    Optional<RoomCardSnapshot> roomCardOptional = cardStateStore.findRoomCard(performance.roomId());
    PerformanceSnapShot restored = performance;
    if (roomCardOptional.isEmpty()
        || !performance.performanceId().equals(roomCardOptional.get().performanceId())) {
      return restored;
    }

    RoomCardSnapshot roomCard = roomCardOptional.get();
    cardStateStore.deleteRoomCard(roomCard.roomId());
    if (roomCard.status() == RoomCardStatus.PENDING) {
      publishCancelled(roomCard, reason);
      return restored;
    }

    restored = restorePerformanceSettings(restored, roomCard);
    if (restored != performance) {
      performanceStore.save(restored);
    }
    publishEnded(roomCard, reason, now());
    return restored;
  }

  private PerformanceSnapShot doCloseForPerformance(
      PerformanceSnapShot performance, CardEffectEndReason reason) {
    Optional<RoomCardSnapshot> roomCardOptional = cardStateStore.findRoomCard(performance.roomId());
    PerformanceSnapShot restored = performance;
    if (roomCardOptional.isPresent()
        && performance.performanceId().equals(roomCardOptional.get().performanceId())) {
      RoomCardSnapshot roomCard = roomCardOptional.get();
      if (roomCard.status() == RoomCardStatus.PENDING) {
        cardStateStore.deleteRoomCard(roomCard.roomId());
        publishCancelled(roomCard, reason);
      } else if (roomCard.status() == RoomCardStatus.ACTIVE) {
        cardStateStore.deleteRoomCard(roomCard.roomId());
        restored = restorePerformanceSettings(restored, roomCard);
        if (restored != performance) {
          performanceStore.save(restored);
        }
        publishEnded(roomCard, reason, now());
      }
    }
    cardStateStore.deleteCardState(performance.roomId(), performance.performanceId());
    return restored;
  }

  public synchronized void closeRoom(Long roomId) {
    performanceStore
        .findActiveByRoomId(roomId)
        .ifPresent(
            performance -> closeForPerformance(performance, CardEffectEndReason.ROOM_TERMINATED));
  }

  public Optional<CardAssignmentSnapshot> findAssignment(
      Long roomId, Long performanceId, Long participantId) {
    return cardStateStore.findAssignment(roomId, performanceId, participantId);
  }

  public Optional<RoomCardSnapshot> findActiveCard(Long roomId) {
    return cardStateStore.findRoomCard(roomId);
  }

  private synchronized void startEffect(Long roomId, Long performanceId, Long participantId) {
    doStartEffect(roomId, performanceId, participantId);
  }

  private void doStartEffect(Long roomId, Long performanceId, Long participantId) {
    RoomCardSnapshot pending = cardStateStore.findRoomCard(roomId).orElse(null);
    if (pending == null
        || pending.status() != RoomCardStatus.PENDING
        || !pending.performanceId().equals(performanceId)
        || !pending.sourceParticipantId().equals(participantId)) {
      return;
    }

    Optional<CardAssignmentSnapshot> assignmentOptional =
        cardStateStore.findAssignment(roomId, performanceId, participantId);
    Optional<PerformanceSnapShot> performanceOptional = performanceStore.findActiveByRoomId(roomId);
    if (assignmentOptional.isEmpty() || performanceOptional.isEmpty()) {
      cancelScheduled(pending, CardEffectEndReason.SYSTEM_CANCELLED);
      return;
    }

    PerformanceSnapShot performance = performanceOptional.get();
    CardAssignmentSnapshot assignment = assignmentOptional.get();
    if (assignment.status() != CardAssignmentStatus.ASSIGNED
        || performance.status() != PerformanceStatus.PLAYING
        || !performance.performanceId().equals(performanceId)) {
      cancelScheduled(pending, CardEffectEndReason.SYSTEM_CANCELLED);
      return;
    }

    OffsetDateTime startedAt = now();
    OffsetDateTime endsAt = startedAt.plusSeconds(pending.durationSeconds());
    Integer previousValue = previousValue(performance.settings(), pending.effectType());
    RoomCardSnapshot active = pending.active(startedAt, endsAt, previousValue);
    CardAssignmentSnapshot used = assignment.used(startedAt);
    cardStateStore.saveAssignment(used);
    cardStateStore.saveRoomCard(active);

    PerformanceSnapShot changed =
        performance.changeSettings(applyEffect(performance.settings(), active));
    try {
      performanceStore.save(changed);
    } catch (RuntimeException exception) {
      cardStateStore.deleteRoomCard(roomId);
      publishEnded(active, CardEffectEndReason.SYSTEM_CANCELLED, now());
      return;
    }

    // 카드 사용 시작 처리
    eventPublisher.publishToRoom(
        roomId,
        CardWebSocketEventType.CARD_EFFECT_STARTED,
        new CardEffectStartedPayload(
            active.performanceId(),
            active.sourceParticipantId(),
            active.targetParticipantId(),
            active.targetType(),
            active.cardId(),
            active.cardCode(),
            active.cardName(),
            active.description(),
            active.effectType(),
            active.effectValue(),
            active.durationSeconds(),
            active.startedAt(),
            active.endsAt()));
    // 효과 종료 이펙트 메서드 예약
    taskScheduler.schedule(
        () -> finishEffect(roomId, performanceId, participantId), endsAt.toInstant());
  }

  private synchronized void finishEffect(
      Long roomId, Long performanceId, Long sourceParticipantId) {
    doFinishEffect(roomId, performanceId, sourceParticipantId);
  }

  private void doFinishEffect(Long roomId, Long performanceId, Long sourceParticipantId) {
    RoomCardSnapshot roomCard = cardStateStore.findRoomCard(roomId).orElse(null);
    if (roomCard == null
        || roomCard.status() != RoomCardStatus.ACTIVE
        || !roomCard.performanceId().equals(performanceId)
        || !roomCard.sourceParticipantId().equals(sourceParticipantId)) {
      return;
    }
    cardStateStore.deleteRoomCard(roomId);

    performanceStore
        .findActiveByRoomId(roomId)
        .filter(performance -> performance.performanceId().equals(performanceId))
        .filter(performance -> performance.status() == PerformanceStatus.PLAYING)
        .map(performance -> restorePerformanceSettings(performance, roomCard))
        .ifPresent(performanceStore::save);
    publishEnded(roomCard, CardEffectEndReason.DURATION_EXPIRED, now());
  }

  private void cancelScheduled(RoomCardSnapshot roomCard, CardEffectEndReason reason) {
    if (roomCard == null) {
      return;
    }
    RoomCardSnapshot current = cardStateStore.findRoomCard(roomCard.roomId()).orElse(null);
    if (current == null
        || current.status() != RoomCardStatus.PENDING
        || !current.performanceId().equals(roomCard.performanceId())
        || !current.sourceParticipantId().equals(roomCard.sourceParticipantId())) {
      return;
    }
    cardStateStore.deleteRoomCard(roomCard.roomId());
    publishCancelled(roomCard, reason);
  }

  private Card draw(List<Card> cards) {
    Map<CardTier, List<Card>> cardsByTier = new EnumMap<>(CardTier.class);
    for (Card card : cards) {
      cardsByTier.computeIfAbsent(card.getTier(), ignored -> new ArrayList<>()).add(card);
    }

    long totalWeight = cardsByTier.keySet().stream().mapToLong(CardTier::drawWeight).sum();
    long selected = random.nextLong(totalWeight);
    long cumulative = 0;
    CardTier selectedTier = null;
    for (CardTier tier : CardTier.values()) {
      if (!cardsByTier.containsKey(tier)) {
        continue;
      }
      cumulative += tier.drawWeight();
      if (selected < cumulative) {
        selectedTier = tier;
        break;
      }
    }

    List<Card> selectedTierCards = cardsByTier.get(selectedTier);
    return selectedTierCards.get(random.nextInt(selectedTierCards.size()));
  }

  private CardAssignmentSnapshot toAssignment(
      Long roomId,
      PerformanceSnapShot performance,
      RoomParticipant participant,
      Card card,
      OffsetDateTime assignedAt) {
    return new CardAssignmentSnapshot(
        roomId,
        performance.performanceId(),
        participant.getId(),
        participant.getUser().getId(),
        card.getId(),
        card.getCode(),
        card.getName(),
        card.getDescription(),
        card.getEffectType(),
        card.getTargetType(),
        card.getEffectValue(),
        card.getDurationSeconds(),
        card.getTier(),
        CardAssignmentStatus.ASSIGNED,
        assignedAt,
        null);
  }

  private void publishAssigned(CardAssignmentSnapshot assignment) {
    eventPublisher.publishToUser(
        assignment.userId(),
        assignment.roomId(),
        CardWebSocketEventType.CARD_ASSIGNED,
        new CardAssignedPayload(
            assignment.performanceId(),
            assignment.participantId(),
            assignment.cardId(),
            assignment.cardCode(),
            assignment.cardName(),
            assignment.description(),
            assignment.effectType(),
            assignment.targetType(),
            assignment.effectValue(),
            assignment.durationSeconds(),
            assignment.tier()));
  }

  private CardActivationScheduledPayload scheduledPayload(
      RoomCardSnapshot roomCard, OffsetDateTime serverNow) {
    return new CardActivationScheduledPayload(
        roomCard.performanceId(),
        roomCard.sourceParticipantId(),
        serverNow,
        ACTIVATION_COUNTDOWN_SECONDS,
        roomCard.approvedAt(),
        roomCard.activateAt());
  }

  private void publishCancelled(RoomCardSnapshot roomCard, CardEffectEndReason reason) {
    eventPublisher.publishToRoom(
        roomCard.roomId(),
        CardWebSocketEventType.CARD_ACTIVATION_CANCELLED,
        new CardActivationCancelledPayload(
            roomCard.performanceId(),
            roomCard.sourceParticipantId(),
            reason,
            now()));
  }

  private void publishEnded(
      RoomCardSnapshot roomCard, CardEffectEndReason reason, OffsetDateTime endedAt) {
    eventPublisher.publishToRoom(
        roomCard.roomId(),
        CardWebSocketEventType.CARD_EFFECT_ENDED,
        new CardEffectEndedPayload(
            roomCard.performanceId(),
            roomCard.sourceParticipantId(),
            roomCard.targetParticipantId(),
            roomCard.targetType(),
            roomCard.cardId(),
            roomCard.cardCode(),
            roomCard.cardName(),
            roomCard.description(),
            roomCard.effectType(),
            roomCard.effectValue(),
            roomCard.previousValue(),
            roomCard.durationSeconds(),
            roomCard.startedAt(),
            endedAt,
            reason));
  }

  private PerformanceSettings applyEffect(PerformanceSettings settings, RoomCardSnapshot roomCard) {
    return switch (roomCard.effectType()) {
      case MR_KEY_CHANGE ->
          new PerformanceSettings(
              clamp(settings.keyOffset() + roomCard.effectValue(), -6, 6),
              settings.tempoPercent(),
              settings.mrVolumePercent(),
              settings.echoLevel());
      case MR_TEMPO_CHANGE ->
          new PerformanceSettings(
              settings.keyOffset(),
              clamp(
                  settings.tempoPercent() + roomCard.effectValue() * TEMPO_PERCENT_PER_STEP,
                  50,
                  150),
              settings.mrVolumePercent(),
              settings.echoLevel());
      case MIC_OPEN, LYRICS_HIDE -> settings;
    };
  }

  private PerformanceSnapShot restorePerformanceSettings(
      PerformanceSnapShot performance, RoomCardSnapshot roomCard) {
    if (roomCard.previousValue() == null) {
      return performance;
    }
    PerformanceSettings settings = performance.settings();
    PerformanceSettings restored =
        switch (roomCard.effectType()) {
          case MR_KEY_CHANGE ->
              new PerformanceSettings(
                  roomCard.previousValue(),
                  settings.tempoPercent(),
                  settings.mrVolumePercent(),
                  settings.echoLevel());
          case MR_TEMPO_CHANGE ->
              new PerformanceSettings(
                  settings.keyOffset(),
                  roomCard.previousValue(),
                  settings.mrVolumePercent(),
                  settings.echoLevel());
          case MIC_OPEN, LYRICS_HIDE -> settings;
        };
    return performance.changeSettings(restored);
  }

  private Integer previousValue(PerformanceSettings settings, CardEffectType type) {
    return switch (type) {
      case MR_KEY_CHANGE -> settings.keyOffset();
      case MR_TEMPO_CHANGE -> settings.tempoPercent();
      case MIC_OPEN, LYRICS_HIDE -> null;
    };
  }

  private void validateAssignment(CardAssignmentSnapshot assignment) {
    if (assignment.status() == CardAssignmentStatus.USED) {
      throw business(WebSocketErrorCode.CARD_ALREADY_USED);
    }
    if (assignment.status() != CardAssignmentStatus.ASSIGNED) {
      throw business(WebSocketErrorCode.INVALID_CARD_STATE);
    }
  }

  private void validateNoRoomCard(Long roomId) {
    cardStateStore
        .findRoomCard(roomId)
        .ifPresent(
            roomCard -> {
              if (roomCard.status() == RoomCardStatus.PENDING) {
                throw business(WebSocketErrorCode.CARD_ACTIVATION_PENDING);
              }
              throw business(WebSocketErrorCode.CARD_EFFECT_ALREADY_ACTIVE);
            });
  }

  private int clamp(int value, int minimum, int maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  private OffsetDateTime now() {
    return OffsetDateTime.now(clock).atZoneSameInstant(SEOUL_ZONE_ID).toOffsetDateTime();
  }

  private void validatePositive(Long value, String fieldName) {
    if (value == null || value <= 0) {
      throw new WebSocketBusinessException(
          WebSocketErrorCode.INVALID_REQUEST, fieldName + "은 양의 정수여야 합니다.");
    }
  }

  private WebSocketBusinessException business(WebSocketErrorCode code) {
    return new WebSocketBusinessException(code);
  }
}
