package com.ssafy.ssasukae.global.security.websocket;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;

import org.junit.jupiter.api.Test;

class WebSocketLoginSessionRegistryTest {

  private final WebSocketLoginSessionRegistry registry =
      new WebSocketLoginSessionRegistry();

  @Test
  void sameSidPreviousSessionIsReplaced() {
    registry.register("ws-old", 1L, "sid-A");
    registry.register("ws-new", 1L, "sid-A");

    Set<String> replaced = registry.markOtherSessionsForReplacement("ws-new");

    assertThat(replaced).containsExactly("ws-old");
    assertThat(registry.unregister("ws-old").replaced()).isTrue();
    assertThat(registry.unregister("ws-new").replaced()).isFalse();
  }

  @Test
  void differentSidPreviousSessionsAreReplaced() {
    registry.register("ws-old-1", 1L, "sid-A");
    registry.register("ws-old-2", 1L, "sid-A");
    registry.register("ws-new", 1L, "sid-B");

    Set<String> replaced = registry.markOtherSessionsForReplacement("ws-new");

    assertThat(replaced).containsExactlyInAnyOrder("ws-old-1", "ws-old-2");
  }

  @Test
  void anotherUsersSessionIsNotReplaced() {
    registry.register("ws-user-1", 1L, "sid-A");
    registry.register("ws-user-2", 2L, "sid-B");

    assertThat(registry.markOtherSessionsForReplacement("ws-user-2")).isEmpty();
  }
}
