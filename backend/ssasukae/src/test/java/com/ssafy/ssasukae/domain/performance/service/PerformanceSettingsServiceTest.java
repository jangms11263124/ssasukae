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

import com.ssafy.ssasukae.domain.performance.dto.UpdatePerformanceSettingsRequest;
import com.ssafy.ssasukae.domain.performance.entity.Performance;
import com.ssafy.ssasukae.domain.performance.entity.PerformanceSettings;
import com.ssafy.ssasukae.domain.performance.event.PerformanceSettingsChangedDomainEvent;
import com.ssafy.ssasukae.domain.performance.repository.PerformanceRepository;
import com.ssafy.ssasukae.domain.performance.repository.PerformanceSettingsRepository;
import com.ssafy.ssasukae.domain.performance.type.PerformanceSettingsChangeSource;
import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.repository.RoomParticipantRepository;
import com.ssafy.ssasukae.domain.room.repository.RoomRepository;
import com.ssafy.ssasukae.domain.room.type.RoomMode;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import com.ssafy.ssasukae.domain.song.type.SongStatus;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.performance.PerformanceException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class PerformanceSettingsServiceTest {

  private static final Instant NOW = Instant.parse("2026-07-22T03:10:00Z");
  private static final LocalDateTime CREATED = LocalDateTime.of(2026, 7, 22, 3, 0);

  @Mock private RoomRepository roomRepository;
  @Mock private RoomParticipantRepository roomParticipantRepository;
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
                    songRepository,
                    performanceRepository,
                    performanceSettingsRepository,
                    applicationEventPublisher,
                    Clock.fixed(NOW, ZoneOffset.UTC));
  }

  @Test
  void performerUpdatesPartialSettings() {
    Fixture fixture = fixture();
    stubUpdate(fixture, fixture.performer());
    when(performanceSettingsRepository.saveAndFlush(fixture.settings()))
            .thenAnswer(
                    invocation -> {
                      ReflectionTestUtils.setField(fixture.settings(), "version", 1L);
                      return fixture.settings();
                    });

    var response =
            performanceService.updatePerformanceSettings(
                    1L,
                    400L,
                    20L,
                    new UpdatePerformanceSettingsRequest(0L, 2, 110, 80, null, 25, 30));

    assertThat(response.changed()).isTrue();
    assertThat(response.settings().version()).isEqualTo(1L);
    assertThat(response.settings().keyOffset()).isEqualTo(2);
    assertThat(response.settings().micVolumePercent()).isEqualTo(100);
    assertThat(fixture.room().getVersion()).isEqualTo(3L);

    ArgumentCaptor<PerformanceSettingsChangedDomainEvent> eventCaptor =
            ArgumentCaptor.forClass(PerformanceSettingsChangedDomainEvent.class);
    verify(applicationEventPublisher).publishEvent(eventCaptor.capture());
    assertThat(eventCaptor.getValue().source())
            .isEqualTo(PerformanceSettingsChangeSource.USER);
    assertThat(eventCaptor.getValue().settingsVersion()).isEqualTo(1L);
  }

  @Test
  void sameValuesDoNotIncreaseVersionsOrPublishEvent() {
    Fixture fixture = fixture();
    stubUpdate(fixture, fixture.performer());

    var response =
            performanceService.updatePerformanceSettings(
                    1L,
                    400L,
                    20L,
                    new UpdatePerformanceSettingsRequest(0L, 0, 100, 100, 100, 0, 0));

    assertThat(response.changed()).isFalse();
    assertThat(fixture.room().getVersion()).isEqualTo(2L);
    verify(performanceSettingsRepository, never()).saveAndFlush(fixture.settings());
    verify(applicationEventPublisher, never()).publishEvent(org.mockito.ArgumentMatchers.any());
  }

  @Test
  void rejectsStaleVersion() {
    Fixture fixture = fixture();
    ReflectionTestUtils.setField(fixture.settings(), "version", 2L);
    stubUpdate(fixture, fixture.performer());

    assertThatThrownBy(
            () ->
                    performanceService.updatePerformanceSettings(
                            1L,
                            400L,
                            20L,
                            new UpdatePerformanceSettingsRequest(
                                    1L, 2, null, null, null, null, null)))
            .isInstanceOf(PerformanceException.class)
            .hasMessageContaining("expectedVersion=1")
            .hasMessageContaining("actualVersion=2");

    verify(performanceSettingsRepository, never()).saveAndFlush(fixture.settings());
  }

  @Test
  void rejectsNonPerformer() {
    Fixture fixture = fixture();
    stubRoomAndPerformance(fixture);
    stubRequester(fixture.host());

    assertThatThrownBy(
            () ->
                    performanceService.updatePerformanceSettings(
                            1L,
                            400L,
                            10L,
                            new UpdatePerformanceSettingsRequest(
                                    0L, 2, null, null, null, null, null)))
            .isInstanceOf(PerformanceException.class)
            .hasMessage("현재 공연자만 공연 설정을 변경할 수 있습니다.");
  }

  @Test
  void rejectsChangeAfterPlaybackFinishes() {
    Fixture fixture = fixture();
    fixture.performance().startPlayback(CREATED.plusMinutes(1));
    fixture.performance().finishPlayback(CREATED.plusMinutes(4));
    stubRoomAndPerformance(fixture);

    assertThatThrownBy(
            () ->
                    performanceService.updatePerformanceSettings(
                            1L,
                            400L,
                            20L,
                            new UpdatePerformanceSettingsRequest(
                                    0L, null, 120, null, null, null, null)))
            .isInstanceOf(PerformanceException.class)
            .hasMessageContaining("ANALYZING");
  }

  @Test
  void activeParticipantCanReadLatestSettings() {
    Fixture fixture = fixture();
    when(performanceRepository.findByIdAndRoom_Id(400L, 1L))
            .thenReturn(Optional.of(fixture.performance()));
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(1L, 10L))
            .thenReturn(Optional.of(fixture.host()));
    when(performanceSettingsRepository.findByPerformance_Id(400L))
            .thenReturn(Optional.of(fixture.settings()));

    var response = performanceService.getPerformanceSettings(1L, 400L, 10L);

    assertThat(response.performanceId()).isEqualTo(400L);
    assertThat(response.version()).isZero();
  }

  private void stubUpdate(Fixture fixture, RoomParticipant requester) {
    stubRoomAndPerformance(fixture);
    stubRequester(requester);
    stubSettings(fixture.settings());
  }

  private void stubRoomAndPerformance(Fixture fixture) {
    when(roomRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(fixture.room()));
    when(performanceRepository.findByIdAndRoom_Id(400L, 1L))
            .thenReturn(Optional.of(fixture.performance()));
  }

  private void stubRequester(RoomParticipant requester) {
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(1L, requester.getUser().getId()))
            .thenReturn(Optional.of(requester));
  }

  private void stubSettings(PerformanceSettings settings) {
    when(performanceSettingsRepository.findByPerformance_Id(400L))
            .thenReturn(Optional.of(settings));
  }

  private Fixture fixture() {
    User creator = user(1L, "creator");
    User hostUser = user(10L, "host");
    User performerUser = user(20L, "performer");
    Room room =
            Room.create(creator, "ABC123", "room", RoomMode.GENERAL, 4, "mock", CREATED);
    ReflectionTestUtils.setField(room, "id", 1L);
    RoomParticipant host = RoomParticipant.host(room, hostUser, CREATED);
    ReflectionTestUtils.setField(host, "id", 100L);
    RoomParticipant performer = RoomParticipant.participant(room, performerUser, CREATED);
    ReflectionTestUtils.setField(performer, "id", 200L);
    Song song = Song.create("song", "artist", SongStatus.READY);
    ReflectionTestUtils.setField(song, "id", 300L);
    Performance performance = Performance.prepare(room, performer, song, 1, CREATED);
    ReflectionTestUtils.setField(performance, "id", 400L);
    PerformanceSettings settings = PerformanceSettings.defaults(performance);
    ReflectionTestUtils.setField(settings, "id", 500L);
    room.startPerformance(CREATED);
    return new Fixture(room, host, performer, performance, settings);
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
          Room room,
          RoomParticipant host,
          RoomParticipant performer,
          Performance performance,
          PerformanceSettings settings) {}
}
