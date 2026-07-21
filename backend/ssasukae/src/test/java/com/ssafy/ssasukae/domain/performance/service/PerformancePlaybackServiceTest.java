package com.ssafy.ssasukae.domain.performance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import com.ssafy.ssasukae.domain.card.service.CardAssignmentService;

import com.ssafy.ssasukae.domain.performance.entity.Performance;
import com.ssafy.ssasukae.domain.performance.event.PerformanceTransitionDomainEvent;
import com.ssafy.ssasukae.domain.performance.event.PerformanceTransitionKind;
import com.ssafy.ssasukae.domain.performance.repository.PerformanceRepository;
import com.ssafy.ssasukae.domain.performance.repository.PerformanceSettingsRepository;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.room.type.RoomStatus;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import com.ssafy.ssasukae.domain.song.type.SongStatus;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.performance.PerformanceException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class PerformancePlaybackServiceTest {

  private static final Instant NOW = Instant.parse("2026-07-22T02:00:00Z");
  private static final LocalDateTime NOW_LOCAL = LocalDateTime.ofInstant(NOW, ZoneOffset.UTC);
  private static final LocalDateTime PREVIOUS_TIME = NOW_LOCAL.minusMinutes(1);

  @Mock private RoomRepository roomRepository;
  @Mock private RoomParticipantRepository roomParticipantRepository;
  @Mock private CardAssignmentService cardAssignmentService;
  @Mock private SongRepository songRepository;
  @Mock private PerformanceRepository performanceRepository;
  @Mock private PerformanceSettingsRepository performanceSettingsRepository;
  @Mock private ApplicationEventPublisher applicationEventPublisher;

  private PerformanceService performanceService;

  @BeforeEach
  void setUp() {
    performanceService =
        new PerformanceService(
            roomRepository,
            roomParticipantRepository,
            cardAssignmentService,
            songRepository,
            performanceRepository,
            performanceSettingsRepository,
            applicationEventPublisher,
            Clock.fixed(NOW, ZoneOffset.UTC));
  }

  @Test
  @DisplayName("현재 공연자가 재생을 시작하면 PREPARING에서 PLAYING으로 전환된다")
  void startPlayback_success() {
    Fixture fixture = fixture();
    mockTransitionLookup(fixture, fixture.performerUser.getId());

    var result =
        performanceService.startPlayback(
            fixture.room.getId(), fixture.performance.getId(), fixture.performerUser.getId());

    assertThat(result.changed()).isTrue();
    assertThat(result.status()).isEqualTo(PerformanceStatus.PLAYING);
    assertThat(result.performanceVersion()).isEqualTo(2L);
    assertThat(result.changedAt()).isEqualTo(NOW_LOCAL);
    assertThat(fixture.performance.getPlaybackStartedAt()).isEqualTo(NOW_LOCAL);
    assertThat(fixture.room.getStatus()).isEqualTo(RoomStatus.PLAYING);
    assertThat(fixture.room.getVersion()).isEqualTo(4L);

    ArgumentCaptor<PerformanceTransitionDomainEvent> eventCaptor =
        ArgumentCaptor.forClass(PerformanceTransitionDomainEvent.class);
    verify(applicationEventPublisher).publishEvent(eventCaptor.capture());
    PerformanceTransitionDomainEvent event = eventCaptor.getValue();
    assertThat(event.stateChangedRoomVersion()).isEqualTo(3L);
    assertThat(event.specificRoomVersion()).isEqualTo(4L);
    assertThat(event.previousStatus()).isEqualTo(PerformanceStatus.PREPARING);
    assertThat(event.currentStatus()).isEqualTo(PerformanceStatus.PLAYING);
    assertThat(event.kind()).isEqualTo(PerformanceTransitionKind.PLAYBACK_STARTED);
  }

  @Test
  @DisplayName("재생 시작 명령을 다시 보내면 버전과 이벤트가 증가하지 않는다")
  void startPlayback_isIdempotent() {
    Fixture fixture = fixture();
    fixture.performance.startPlayback(PREVIOUS_TIME);
    mockTransitionLookup(fixture, fixture.performerUser.getId());
    long roomVersionBefore = fixture.room.getVersion();

    var result =
        performanceService.startPlayback(
            fixture.room.getId(), fixture.performance.getId(), fixture.performerUser.getId());

    assertThat(result.changed()).isFalse();
    assertThat(result.changedAt()).isEqualTo(PREVIOUS_TIME);
    assertThat(fixture.performance.getVersion()).isEqualTo(2L);
    assertThat(fixture.room.getVersion()).isEqualTo(roomVersionBefore);
    verify(applicationEventPublisher, never()).publishEvent(org.mockito.ArgumentMatchers.any());
  }

  @Test
  @DisplayName("현재 공연자가 재생을 종료하면 PLAYING에서 ANALYZING으로 전환된다")
  void finishPlayback_success() {
    Fixture fixture = fixture();
    fixture.performance.startPlayback(PREVIOUS_TIME);
    mockTransitionLookup(fixture, fixture.performerUser.getId());

    var result =
        performanceService.finishPlayback(
            fixture.room.getId(), fixture.performance.getId(), fixture.performerUser.getId());

    assertThat(result.changed()).isTrue();
    assertThat(result.status()).isEqualTo(PerformanceStatus.ANALYZING);
    assertThat(result.performanceVersion()).isEqualTo(3L);
    assertThat(fixture.performance.getPlaybackFinishedAt()).isEqualTo(NOW_LOCAL);
    assertThat(fixture.room.getStatus()).isEqualTo(RoomStatus.PLAYING);
    assertThat(fixture.room.getVersion()).isEqualTo(4L);
  }

  @Test
  @DisplayName("재생 시작 전에는 재생 종료를 처리할 수 없다")
  void finishPlayback_rejectsPreparingPerformance() {
    Fixture fixture = fixture();
    mockTransitionLookup(fixture, fixture.performerUser.getId());

    assertThatThrownBy(
            () ->
                performanceService.finishPlayback(
                    fixture.room.getId(),
                    fixture.performance.getId(),
                    fixture.performerUser.getId()))
        .isInstanceOf(PerformanceException.class)
        .hasMessageContaining("PREPARING에서 ANALYZING");

    verify(applicationEventPublisher, never()).publishEvent(org.mockito.ArgumentMatchers.any());
  }

  @Test
  @DisplayName("방장은 준비 중인 공연을 취소하고 방을 PREPARING으로 되돌릴 수 있다")
  void cancelPerformance_byHost() {
    Fixture fixture = fixture();
    mockTransitionLookup(fixture, fixture.hostUser.getId());

    var result =
        performanceService.cancelPerformance(
            fixture.room.getId(), fixture.performance.getId(), fixture.hostUser.getId());

    assertThat(result.changed()).isTrue();
    assertThat(result.status()).isEqualTo(PerformanceStatus.CANCELLED);
    assertThat(fixture.performance.getCancelledAt()).isEqualTo(NOW_LOCAL);
    assertThat(fixture.room.getStatus()).isEqualTo(RoomStatus.PREPARING);
    assertThat(fixture.room.getVersion()).isEqualTo(4L);
  }

  @Test
  @DisplayName("방장도 공연자도 아닌 참가자는 공연을 취소할 수 없다")
  void cancelPerformance_rejectsUnrelatedParticipant() {
    Fixture fixture = fixture();
    User otherUser = user(30L, "일반 참가자");
    RoomParticipant other = participant(fixture.room, otherUser, 300L);

    when(roomRepository.findByIdForUpdate(fixture.room.getId()))
        .thenReturn(Optional.of(fixture.room));
    when(performanceRepository.findByIdAndRoom_Id(
            fixture.performance.getId(), fixture.room.getId()))
        .thenReturn(Optional.of(fixture.performance));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(
            fixture.room.getId(), otherUser.getId()))
        .thenReturn(Optional.of(other));

    assertThatThrownBy(
            () ->
                performanceService.cancelPerformance(
                    fixture.room.getId(), fixture.performance.getId(), otherUser.getId()))
        .isInstanceOf(PerformanceException.class)
        .hasMessage("방장 또는 현재 공연자만 공연을 취소할 수 있습니다.");

    assertThat(fixture.performance.getStatus()).isEqualTo(PerformanceStatus.PREPARING);
    verify(applicationEventPublisher, never()).publishEvent(org.mockito.ArgumentMatchers.any());
  }

  @Test
  @DisplayName("취소 명령을 다시 보내면 방과 공연 버전이 증가하지 않는다")
  void cancelPerformance_isIdempotent() {
    Fixture fixture = fixture();
    fixture.performance.cancel(PREVIOUS_TIME);
    fixture.room.cancelPerformance(PREVIOUS_TIME);
    mockTransitionLookup(fixture, fixture.hostUser.getId());
    long roomVersionBefore = fixture.room.getVersion();

    var result =
        performanceService.cancelPerformance(
            fixture.room.getId(), fixture.performance.getId(), fixture.hostUser.getId());

    assertThat(result.changed()).isFalse();
    assertThat(result.changedAt()).isEqualTo(PREVIOUS_TIME);
    assertThat(fixture.room.getVersion()).isEqualTo(roomVersionBefore);
    verify(applicationEventPublisher, never()).publishEvent(org.mockito.ArgumentMatchers.any());
  }

  private void mockTransitionLookup(Fixture fixture, Long requesterUserId) {
    RoomParticipant requester =
        requesterUserId.equals(fixture.hostUser.getId()) ? fixture.host : fixture.performer;
    when(roomRepository.findByIdForUpdate(fixture.room.getId()))
        .thenReturn(Optional.of(fixture.room));
    when(performanceRepository.findByIdAndRoom_Id(
            fixture.performance.getId(), fixture.room.getId()))
        .thenReturn(Optional.of(fixture.performance));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(
            fixture.room.getId(), requesterUserId))
        .thenReturn(Optional.of(requester));
  }

  private Fixture fixture() {
    User creator = user(1L, "생성자");
    User hostUser = user(10L, "방장");
    User performerUser = user(20L, "공연자");
    Room room =
        Room.create(
            creator,
            "ABC123",
            "테스트방",
            RoomMode.GENERAL,
            4,
            "mock-session",
            PREVIOUS_TIME);
    ReflectionTestUtils.setField(room, "id", 1L);

    RoomParticipant host = host(room, hostUser, 100L);
    RoomParticipant performer = participant(room, performerUser, 200L);
    Song song = Song.create("테스트 곡", "테스트 가수", SongStatus.READY);
    ReflectionTestUtils.setField(song, "id", 300L);

    Performance performance = Performance.prepare(room, performer, song, 1, PREVIOUS_TIME);
    ReflectionTestUtils.setField(performance, "id", 400L);
    room.startPerformance(PREVIOUS_TIME);

    return new Fixture(room, hostUser, performerUser, host, performer, performance);
  }

  private RoomParticipant host(Room room, User user, Long id) {
    RoomParticipant participant = RoomParticipant.host(room, user, PREVIOUS_TIME);
    ReflectionTestUtils.setField(participant, "id", id);
    return participant;
  }

  private RoomParticipant participant(Room room, User user, Long id) {
    RoomParticipant participant = RoomParticipant.participant(room, user, PREVIOUS_TIME);
    ReflectionTestUtils.setField(participant, "id", id);
    return participant;
  }

  private User user(Long id, String nickname) {
    User user =
        User.builder()
            .email("user" + id + "@test.com")
            .nickname(nickname)
            .provider(OAuthProvider.GOOGLE)
            .providerId("provider-" + id)
            .role(Role.USER)
            .build();
    ReflectionTestUtils.setField(user, "id", id);
    return user;
  }

  private record Fixture(
      Room room,
      User hostUser,
      User performerUser,
      RoomParticipant host,
      RoomParticipant performer,
      Performance performance) {}
}
