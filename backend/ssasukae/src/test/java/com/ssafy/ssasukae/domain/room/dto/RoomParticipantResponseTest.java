package com.ssafy.ssasukae.domain.room.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class RoomParticipantResponseTest {

  @Test
  void includesCurrentMediaState() {
    LocalDateTime now = LocalDateTime.of(2026, 7, 22, 1, 0);
    User user =
        User.builder()
            .email("participant@test.com")
            .nickname("참가자")
            .provider(OAuthProvider.GOOGLE)
            .providerId("provider-2")
            .role(Role.USER)
            .build();
    Room room =
        Room.create(user, "ABC123", "테스트방", RoomMode.GENERAL, 4, "session", now);
    RoomParticipant participant = RoomParticipant.participant(room, user, now);
    ReflectionTestUtils.setField(participant, "id", 102L);
    participant.updateMediaState(false, true);

    RoomParticipantResponse response = RoomParticipantResponse.from(participant);

    assertThat(response.participantId()).isEqualTo(102L);
    assertThat(response.micEnabled()).isFalse();
    assertThat(response.cameraEnabled()).isTrue();
  }
}
