package com.ssafy.ssasukae.domain.room.websocket;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class RoomWebSocketSessionRegistryTest {

  private final RoomWebSocketSessionRegistry registry =
      new RoomWebSocketSessionRegistry();

  @Test
  void multipleSessionsDisconnectOnlyAfterLastSession() {
    var first = registry.register("session-1", 10L, 1L);
    var second = registry.register("session-2", 10L, 1L);

    assertThat(first.firstSession()).isTrue();
    assertThat(second.firstSession()).isFalse();
    assertThat(registry.unregister("session-1").lastSession()).isFalse();
    assertThat(registry.unregister("session-2").lastSession()).isTrue();
  }

  @Test
  void duplicateSubscriptionFromSameSessionIsIdempotent() {
    registry.register("session-1", 10L, 1L);

    var duplicate = registry.register("session-1", 10L, 1L);

    assertThat(duplicate.newSession()).isFalse();
    assertThat(registry.unregister("session-1").lastSession()).isTrue();
  }

  @Test
  void oneSessionCannotSubscribeToDifferentRooms() {
    registry.register("session-1", 10L, 1L);

    assertThatThrownBy(() -> registry.register("session-1", 20L, 1L))
        .isInstanceOf(IllegalStateException.class);
  }
}
