package com.ssafy.ssasukae.domain.lowlatency.websocket;

import java.security.Principal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryProperties;
import com.ssafy.ssasukae.domain.performance.service.PerformanceConnectionRecoveryService;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.recovery.ParticipantReconnectDeadlineStore;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.room.websocket.RoomWebSocketEventType;
import com.ssafy.ssasukae.domain.room.websocket.payload.ParticipantConnectionStatusChangedPayload;
import com.ssafy.ssasukae.domain.room.websocket.type.ParticipantStatus;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import com.ssafy.ssasukae.global.websocket.message.WebSocketEvent;
import com.ssafy.ssasukae.global.websocket.publisher.WebSocketEventPublisher;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * LOW_LATENCY 방의 참가자 프레즌스를 STOMP 세션으로 관리한다.
 *
 * <p>일반 모드는 OpenVidu 미디어 웹훅이 접속·끊김을 알려주지만, 저지연 모드는 OpenVidu 를
 * 쓰지 않아 알려주는 주체가 없었다. 그래서 참가자가 입장 후 영원히 CONNECTED 로 남고,
 * 앱이 강제 종료되면 방 정원이 회수되지 않았으며 공연 일시 중지도 발화되지 않았다.
 * 저지연 앱은 STOMP 연결을 세션 내내 유지하므로 이 연결의 생사가 곧 프레즌스다.
 *
 * <p><b>일반 모드는 건드리지 않는다.</b> STOMP 는 웹 사용자도 쓰기 때문에 모드를 확인해
 * LOW_LATENCY 가 아니면 즉시 빠져나온다. 일반 모드의 프레즌스는 지금처럼 OpenVidu 웹훅이
 * 단독으로 담당한다. 두 곳에서 같은 상태를 건드리면 이벤트가 중복되고, STOMP 만 잠깐
 * 끊긴 경우 미디어가 멀쩡한데도 공연이 일시 중지된다.
 *
 * <p>접속과 끊김을 반드시 함께 다뤄야 한다. 끊김만 처리하면 네트워크 순단으로 DISCONNECTED
 * 가 된 뒤 앱이 재연결해도 복구되지 않아, 유예가 끝나면 멀쩡한 사용자가 방에서 밀려난다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LowLatencyPresenceListener {

  private static final List<ConnectionStatus> ACTIVE_STATUSES =
      List.of(ConnectionStatus.PREPARING, ConnectionStatus.CONNECTED, ConnectionStatus.DISCONNECTED);

  private final RoomRepository roomRepository;
  private final RoomParticipantRepository roomParticipantRepository;
  private final ParticipantReconnectDeadlineStore deadlineStore;
  private final PerformanceRecoveryProperties recoveryProperties;
  private final PerformanceConnectionRecoveryService performanceConnectionRecoveryService;
  private final WebSocketEventPublisher webSocketEventPublisher;

  @EventListener
  @Transactional
  public void onConnected(SessionConnectedEvent event) {
    resolveLowLatencyParticipant(event.getUser())
        .ifPresent(
            found -> {
              RoomParticipant participant = found.participant();
              if (participant.isOnline()) {
                // 이미 온라인이면 재연결 유예만 거둔다. 상태 이벤트를 다시 쏘지 않는다.
                deadlineStore.delete(participant.getId());
                return;
              }
              participant.reconnect(null);
              afterCommit(
                  () -> {
                    deadlineStore.delete(participant.getId());
                    publishStatus(found.room(), participant, ParticipantStatus.ONLINE);
                  });
              log.info(
                  "저지연 참가자 재연결: roomId={}, participantId={}",
                  found.room().getId(),
                  participant.getId());
            });
  }

  @EventListener
  @Transactional
  public void onDisconnected(SessionDisconnectEvent event) {
    Principal user = event.getUser();
    if (user == null) {
      // 인증 전에 끊긴 세션이다. 정리할 참가자가 없다.
      return;
    }
    resolveLowLatencyParticipant(user)
        .ifPresent(
            found -> {
              RoomParticipant participant = found.participant();
              if (!participant.isOnline()) {
                return;
              }
              // 일반 모드의 disconnectWithGracePeriod 와 같은 처리다.
              // 유예 안에 STOMP 가 돌아오면 onConnected 가 되돌린다.
              participant.disconnect(LocalDateTime.now());
              deadlineStore.save(
                  participant.getId(),
                  Instant.now().plus(recoveryProperties.getPerformerDisconnectGrace()));
              performanceConnectionRecoveryService.suspendForPerformerDisconnectWithLockedRoom(
                  found.room(), participant);
              afterCommit(
                  () -> publishStatus(found.room(), participant, ParticipantStatus.DISCONNECTED));
              log.info(
                  "저지연 참가자 연결 끊김: roomId={}, participantId={}",
                  found.room().getId(),
                  participant.getId());
            });
  }

  /**
   * STOMP 세션의 사용자로 LOW_LATENCY 활성 참가자를 찾는다.
   *
   * <p>세션에는 방 번호가 없어 userId 로 찾는다. 저지연 방이 아니거나 종료된 방이면 비어 있는
   * 값을 돌려주고, 그 결과 일반 모드에서는 이 리스너가 아무 일도 하지 않는다.
   */
  private Optional<LowLatencyParticipant> resolveLowLatencyParticipant(Principal principal) {
    Long userId = userIdOf(principal);
    if (userId == null) {
      return Optional.empty();
    }
    Optional<RoomParticipant> candidate =
        roomParticipantRepository.findFirstByUserIdAndConnectionStatusInOrderByJoinedAtDescIdDesc(
            userId, ACTIVE_STATUSES);
    if (candidate.isEmpty()) {
      return Optional.empty();
    }
    Long roomId = candidate.get().getRoom().getId();

    // 모드를 먼저 잠금 없이 확인한다. 이 리스너는 모든 STOMP 연결·해제에서 호출되므로,
    // 확인 전에 findByIdForUpdate 를 쓰면 일반 모드 사용자가 페이지를 열고 닫을 때마다
    // 방 행에 쓰기 잠금이 걸려 입장·퇴장·종료와 경합한다.
    if (roomRepository.findModeById(roomId).filter(mode -> mode == RoomMode.LOW_LATENCY).isEmpty()) {
      return Optional.empty();
    }

    return roomRepository
        .findByIdForUpdate(roomId)
        .filter(room -> room.getStatus() != RoomStatus.TERMINATED)
        .flatMap(
            room ->
                roomParticipantRepository
                    .findByIdForUpdate(candidate.get().getId())
                    .filter(RoomParticipant::isActive)
                    .map(locked -> new LowLatencyParticipant(room, locked)));
  }

  private Long userIdOf(Principal principal) {
    if (principal instanceof AuthenticatedUser authenticated) {
      return authenticated.userId();
    }
    // CONNECT 인터셉터가 Authentication 으로 감싸 두므로 한 겹 벗겨 본다.
    if (principal instanceof org.springframework.security.core.Authentication authentication
        && authentication.getPrincipal() instanceof AuthenticatedUser authenticated) {
      return authenticated.userId();
    }
    return null;
  }

  private void publishStatus(Room room, RoomParticipant participant, ParticipantStatus status) {
    webSocketEventPublisher.publishToRoom(
        room.getId(),
        WebSocketEvent.roomEvent(
            RoomWebSocketEventType.PARTICIPANT_CONNECTION_STATUS_CHANGED,
            room.getId(),
            new ParticipantConnectionStatusChangedPayload(participant.getId(), status)));
  }

  private void afterCommit(Runnable action) {
    if (!TransactionSynchronizationManager.isSynchronizationActive()) {
      action.run();
      return;
    }
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCommit() {
            action.run();
          }
        });
  }

  private record LowLatencyParticipant(Room room, RoomParticipant participant) {}
}
