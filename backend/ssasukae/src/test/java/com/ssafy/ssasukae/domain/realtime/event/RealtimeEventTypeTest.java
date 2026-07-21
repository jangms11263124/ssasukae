package com.ssafy.ssasukae.domain.realtime.event;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;

import org.junit.jupiter.api.Test;

class RealtimeEventTypeTest {

  @Test
  void containsEveryEventTypeFromApiSpecification() {
    Set<String> expectedTypes =
            Set.of(
                    "CHAT_MESSAGE",
                    "PONG",
                    "PARTICIPANT_JOINED",
                    "PARTICIPANT_LEFT",
                    "PARTICIPANT_CONNECTION_CHANGED",
                    "HOST_CHANGED",
                    "PARTICIPANT_MEDIA_STATE_CHANGED",
                    "ROOM_MODE_CHANGED",
                    "PERFORMANCE_STARTED",
                    "PERFORMANCE_SETTINGS_CHANGED",
                    "PERFORMANCE_STATE_CHANGED",
                    "PLAYBACK_STARTED",
                    "PLAYBACK_FINISHED",
                    "PERFORMANCE_CANCELLED",
                    "SCORING_PROGRESS_UPDATED",
                    "PERFORMANCE_SCORE_READY",
                    "CARD_ASSIGNED",
                    "CARD_EFFECT_ACTIVATED",
                    "CARD_EFFECT_ENDED",
                    "LEADERBOARD_UPDATED",
                    "ROOM_ENDING",
                    "ROOM_FINISHED",
                    "ERROR");

    assertThat(RealtimeEventType.values())
            .extracting(Enum::name)
            .containsExactlyInAnyOrderElementsOf(expectedTypes);
  }
}