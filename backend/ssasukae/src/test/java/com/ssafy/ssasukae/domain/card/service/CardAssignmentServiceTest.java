package com.ssafy.ssasukae.domain.card.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;

import com.ssafy.ssasukae.domain.card.entity.CardAssignment;
import com.ssafy.ssasukae.domain.card.entity.CardDefinition;
import com.ssafy.ssasukae.domain.card.type.CardEffectType;
import com.ssafy.ssasukae.domain.card.repository.CardAssignmentRepository;
import com.ssafy.ssasukae.domain.card.repository.CardDefinitionRepository;
import com.ssafy.ssasukae.domain.performance.entity.Performance;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.type.SongStatus;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.card.CardException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class CardAssignmentServiceTest {

  private static final LocalDateTime NOW = LocalDateTime.of(2026, 7, 22, 4, 0);

  @Mock private CardDefinitionRepository cardDefinitionRepository;
  @Mock private CardAssignmentRepository cardAssignmentRepository;
  @Mock private RoomParticipantRepository roomParticipantRepository;
  @Mock private WeightedCardPicker weightedCardPicker;

  private CardAssignmentService service;

  @BeforeEach
  void setUp() {
    service =
        new CardAssignmentService(
            cardDefinitionRepository,
            cardAssignmentRepository,
            roomParticipantRepository,
            weightedCardPicker);
  }

  @Test
  void assignsOneCardToEveryOnlineParticipantExceptPerformer() {
    Fixture fixture = fixture();
    CardDefinition card = card(500L, "PITCH_UP_2");

    when(cardAssignmentRepository.existsByPerformance_Id(400L)).thenReturn(false);
    when(roomParticipantRepository.findAllByRoom_IdAndConnectionStatusOrderByJoinedAtAsc(
            1L, ConnectionStatus.ONLINE))
        .thenReturn(List.of(fixture.host(), fixture.performer(), fixture.audience()));
    when(cardDefinitionRepository.findAllByActiveTrueOrderByIdAsc()).thenReturn(List.of(card));
    when(weightedCardPicker.pick(List.of(card))).thenReturn(card);
    when(cardAssignmentRepository.saveAll(anyList()))
        .thenAnswer(
            invocation -> {
              List<CardAssignment> assignments = invocation.getArgument(0);
              for (int i = 0; i < assignments.size(); i++) {
                ReflectionTestUtils.setField(assignments.get(i), "id", 600L + i);
              }
              return assignments;
            });

    CardAssignmentBatch result = service.assignForPerformance(fixture.performance(), NOW);

    assertThat(result.assignments()).hasSize(2);
    assertThat(result.assignments())
        .extracting(assignment -> assignment.getOwner().getId())
        .containsExactly(100L, 300L);
    assertThat(result.assignments())
        .allSatisfy(
            assignment -> {
              assertThat(assignment.getCardDefinition()).isSameAs(card);
              assertThat(assignment.getPerformance()).isSameAs(fixture.performance());
            });
  }

  @Test
  void completesWithZeroCardsWhenOnlyPerformerIsOnline() {
    Fixture fixture = fixture();
    when(cardAssignmentRepository.existsByPerformance_Id(400L)).thenReturn(false);
    when(roomParticipantRepository.findAllByRoom_IdAndConnectionStatusOrderByJoinedAtAsc(
            1L, ConnectionStatus.ONLINE))
        .thenReturn(List.of(fixture.performer()));

    CardAssignmentBatch result = service.assignForPerformance(fixture.performance(), NOW);

    assertThat(result.assignments()).isEmpty();
    verify(cardDefinitionRepository, never()).findAllByActiveTrueOrderByIdAsc();
    verify(cardAssignmentRepository, never()).saveAll(anyList());
  }

  @Test
  void rejectsAssignmentWhenNoActiveCardExists() {
    Fixture fixture = fixture();
    when(cardAssignmentRepository.existsByPerformance_Id(400L)).thenReturn(false);
    when(roomParticipantRepository.findAllByRoom_IdAndConnectionStatusOrderByJoinedAtAsc(
            1L, ConnectionStatus.ONLINE))
        .thenReturn(List.of(fixture.performer(), fixture.host()));
    when(cardDefinitionRepository.findAllByActiveTrueOrderByIdAsc()).thenReturn(List.of());

    assertThatThrownBy(() -> service.assignForPerformance(fixture.performance(), NOW))
        .isInstanceOf(CardException.class)
        .hasMessage("배정할 수 있는 활성 카드가 없습니다.");
  }

  @Test
  void rejectsDuplicateAssignmentForSamePerformance() {
    Fixture fixture = fixture();
    when(cardAssignmentRepository.existsByPerformance_Id(400L)).thenReturn(true);

    assertThatThrownBy(() -> service.assignForPerformance(fixture.performance(), NOW))
        .isInstanceOf(CardException.class)
        .hasMessage("해당 공연의 카드 배정이 이미 완료되었습니다.");

    verify(roomParticipantRepository, never())
        .findAllByRoom_IdAndConnectionStatusOrderByJoinedAtAsc(1L, ConnectionStatus.ONLINE);
  }

  private Fixture fixture() {
    User creator = user(1L, "creator");
    Room room = Room.create(creator, "ABC123", "room", RoomMode.GENERAL, 4, "mock", NOW);
    ReflectionTestUtils.setField(room, "id", 1L);
    RoomParticipant host = RoomParticipant.host(room, user(10L, "host"), NOW);
    ReflectionTestUtils.setField(host, "id", 100L);
    RoomParticipant performer = RoomParticipant.participant(room, user(20L, "performer"), NOW);
    ReflectionTestUtils.setField(performer, "id", 200L);
    RoomParticipant audience = RoomParticipant.participant(room, user(30L, "audience"), NOW);
    ReflectionTestUtils.setField(audience, "id", 300L);
    Song song = Song.create("song", "artist", SongStatus.READY);
    ReflectionTestUtils.setField(song, "id", 350L);
    Performance performance = Performance.prepare(room, performer, song, 1, NOW);
    ReflectionTestUtils.setField(performance, "id", 400L);
    return new Fixture(host, performer, audience, performance);
  }

  private CardDefinition card(Long id, String code) {
    CardDefinition card = CardDefinition.active(
        code,
        "카드",
        "카드 설명",
        CardEffectType.LYRICS_HIDDEN,
        null,
        CardDefinition.MVP_DURATION_SECONDS,
        1);
    ReflectionTestUtils.setField(card, "id", id);
    return card;
  }

  private User user(Long id, String nickname) {
    User user =
        User.builder()
            .email(nickname + "@test.com")
            .nickname(nickname)
            .provider(OAuthProvider.GOOGLE)
            .providerId("provider-" + id)
            .role(Role.USER)
            .build();
    ReflectionTestUtils.setField(user, "id", id);
    return user;
  }

  private record Fixture(
      RoomParticipant host,
      RoomParticipant performer,
      RoomParticipant audience,
      Performance performance) {}
}
