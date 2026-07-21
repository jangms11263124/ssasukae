package com.ssafy.ssasukae.domain.performance.event;

import static org.mockito.Mockito.verify;

import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PerformanceStartedEventListenerTest {

  @Mock private RoomRealtimeEventPublisher roomRealtimeEventPublisher;

  @Test
  void publishesPerformanceStartedRoomEvent() {
    PerformanceStartedEventListener listener =
        new PerformanceStartedEventListener(roomRealtimeEventPublisher);
    PerformanceStartedDomainEvent event =
        new PerformanceStartedDomainEvent(
            1L, 12L, 21L, 12L, 35L, 1, PerformanceStatus.PREPARING);

    listener.handle(event);

    verify(roomRealtimeEventPublisher)
        .publishRoomEvent(
            1L,
            12L,
            RealtimeEventType.PERFORMANCE_STARTED,
            new PerformanceStartedData(
                21L, 12L, 35L, 1, PerformanceStatus.PREPARING));
  }
}
