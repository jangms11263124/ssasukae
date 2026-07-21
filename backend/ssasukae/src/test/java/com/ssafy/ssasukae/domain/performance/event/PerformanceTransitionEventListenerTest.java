package com.ssafy.ssasukae.domain.performance.event;

import static org.mockito.Mockito.inOrder;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PerformanceTransitionEventListenerTest {

  @Mock private RoomRealtimeEventPublisher roomRealtimeEventPublisher;

  @Test
  void publishesStateChangedBeforePlaybackStarted() {
    PerformanceTransitionEventListener listener =
        new PerformanceTransitionEventListener(roomRealtimeEventPublisher);
    LocalDateTime changedAt = LocalDateTime.of(2026, 7, 22, 2, 0);
    PerformanceTransitionDomainEvent event =
        new PerformanceTransitionDomainEvent(
            1L,
            12L,
            13L,
            21L,
            12L,
            12L,
            PerformanceStatus.PREPARING,
            PerformanceStatus.PLAYING,
            2L,
            RoomStatus.PLAYING,
            changedAt,
            PerformanceTransitionKind.PLAYBACK_STARTED);

    listener.handle(event);

    InOrder inOrder = inOrder(roomRealtimeEventPublisher);
    inOrder
        .verify(roomRealtimeEventPublisher)
        .publishRoomEvent(
            1L,
            12L,
            RealtimeEventType.PERFORMANCE_STATE_CHANGED,
            new PerformanceStateChangedData(
                21L,
                PerformanceStatus.PREPARING,
                PerformanceStatus.PLAYING,
                2L,
                RoomStatus.PLAYING,
                changedAt));
    inOrder
        .verify(roomRealtimeEventPublisher)
        .publishRoomEvent(
            1L,
            13L,
            RealtimeEventType.PLAYBACK_STARTED,
            new PlaybackStartedData(
                21L, 12L, PerformanceStatus.PLAYING, changedAt));
  }

  @Test
  void publishesCancellationWithRequesterAndPreparingRoomState() {
    PerformanceTransitionEventListener listener =
        new PerformanceTransitionEventListener(roomRealtimeEventPublisher);
    LocalDateTime changedAt = LocalDateTime.of(2026, 7, 22, 2, 0);
    PerformanceTransitionDomainEvent event =
        new PerformanceTransitionDomainEvent(
            1L,
            20L,
            21L,
            30L,
            12L,
            10L,
            PerformanceStatus.PREPARING,
            PerformanceStatus.CANCELLED,
            2L,
            RoomStatus.PREPARING,
            changedAt,
            PerformanceTransitionKind.PERFORMANCE_CANCELLED);

    listener.handle(event);

    InOrder inOrder = inOrder(roomRealtimeEventPublisher);
    inOrder
        .verify(roomRealtimeEventPublisher)
        .publishRoomEvent(
            1L,
            20L,
            RealtimeEventType.PERFORMANCE_STATE_CHANGED,
            new PerformanceStateChangedData(
                30L,
                PerformanceStatus.PREPARING,
                PerformanceStatus.CANCELLED,
                2L,
                RoomStatus.PREPARING,
                changedAt));
    inOrder
        .verify(roomRealtimeEventPublisher)
        .publishRoomEvent(
            1L,
            21L,
            RealtimeEventType.PERFORMANCE_CANCELLED,
            new PerformanceCancelledData(
                30L,
                12L,
                10L,
                PerformanceStatus.CANCELLED,
                RoomStatus.PREPARING,
                changedAt));
  }
}
