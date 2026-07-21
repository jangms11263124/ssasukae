package com.ssafy.ssasukae.domain.card.entity;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;

import com.ssafy.ssasukae.domain.card.type.CardEffectType;
import com.ssafy.ssasukae.domain.performance.entity.Performance;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.type.SongStatus;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class CardAssignmentTest {

  @Test
  void performerCannotReceiveInterferenceCard() {
    LocalDateTime now = LocalDateTime.of(2026, 7, 22, 4, 0);
    User user = user(1L);
    Room room = Room.create(user, "ABC123", "room", RoomMode.GENERAL, 4, "mock", now);
    ReflectionTestUtils.setField(room, "id", 10L);
    RoomParticipant performer = RoomParticipant.host(room, user, now);
    ReflectionTestUtils.setField(performer, "id", 20L);
    Song song = Song.create("song", "artist", SongStatus.READY);
    ReflectionTestUtils.setField(song, "id", 30L);
    Performance performance = Performance.prepare(room, performer, song, 1, now);
    CardDefinition card =
        CardDefinition.active(
            "TEST",
            "테스트",
            "테스트 카드",
            CardEffectType.LYRICS_HIDDEN,
            null,
            CardDefinition.MVP_DURATION_SECONDS,
            1);

    assertThatThrownBy(() -> CardAssignment.assign(performance, performer, card, now))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("공연자에게는 방해 카드를 배정할 수 없습니다.");
  }

  private User user(Long id) {
    User user =
        User.builder()
            .email("user@test.com")
            .nickname("user")
            .provider(OAuthProvider.GOOGLE)
            .providerId("provider")
            .role(Role.USER)
            .build();
    ReflectionTestUtils.setField(user, "id", id);
    return user;
  }
}
