package com.ssafy.ssasukae.domain.performance.event;

import static org.mockito.Mockito.verify;

import com.ssafy.ssasukae.domain.performance.type.PerformanceSettingsChangeSource;
import com.ssafy.ssasukae.domain.realtime.event.RealtimeEventType;
import com.ssafy.ssasukae.domain.realtime.publisher.RoomRealtimeEventPublisher;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PerformanceSettingsChangedEventListenerTest {

  @Mock private RoomRealtimeEventPublisher roomRealtimeEventPublisher;

  @Test
  void publishesChangedSettingsToRoom() {
    PerformanceSettingsChangedEventListener listener =
        new PerformanceSettingsChangedEventListener(roomRealtimeEventPublisher);
    PerformanceSettingsChangedDomainEvent event =
        new PerformanceSettingsChangedDomainEvent(
            1L,
            12L,
            21L,
            7L,
            PerformanceSettingsChangeSource.USER,
            3L,
            2,
            110,
            80,
            90,
            25,
            30);

    listener.handle(event);

    verify(roomRealtimeEventPublisher)
        .publishRoomEvent(
            1L,
            12L,
            RealtimeEventType.PERFORMANCE_SETTINGS_CHANGED,
            new PerformanceSettingsChangedData(
                21L,
                7L,
                PerformanceSettingsChangeSource.USER,
                3L,
                2,
                110,
                80,
                90,
                25,
                30));
  }
}
