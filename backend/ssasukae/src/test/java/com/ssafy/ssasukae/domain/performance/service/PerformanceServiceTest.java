package com.ssafy.ssasukae.domain.performance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import com.ssafy.ssasukae.domain.performance.dto.StartPerformanceRequest;
import com.ssafy.ssasukae.domain.performance.entity.Performance;
import com.ssafy.ssasukae.domain.performance.entity.PerformanceSettings;
import com.ssafy.ssasukae.domain.performance.event.PerformanceStartedDomainEvent;
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
class PerformanceServiceTest {

  private static final Instant NOW = Instant.parse("2026-07-22T01:00:00Z");
  private static final LocalDateTime NOW_LOCAL = LocalDateTime.ofInstant(NOW, ZoneOffset.UTC);

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
  @DisplayName("방장이 온라인 참가자와 준비된 곡을 선택하면 공연과 기본 설정이 생성된다")
  void startPerformance_success() {
    Room room = room(1L);
    User hostUser = user(10L, "방장");
    User performerUser = user(20L, "공연자");
    RoomParticipant host = host(room, hostUser, 100L);
    RoomParticipant performer = participant(room, performerUser, 200L);
    Song song = song(300L, SongStatus.READY);

    when(roomRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(room));
    when(performanceRepository.existsByRoom_IdAndStatusIn(any(), any())).thenReturn(false);
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(1L, 10L))
        .thenReturn(Optional.of(host));
    when(roomParticipantRepository.findByIdAndRoom_Id(200L, 1L))
        .thenReturn(Optional.of(performer));
    when(songRepository.findById(300L)).thenReturn(Optional.of(song));
    when(performanceRepository.findMaxRoundNoByRoomId(1L)).thenReturn(2);
    when(performanceRepository.save(any(Performance.class)))
        .thenAnswer(
            invocation -> {
              Performance saved = invocation.getArgument(0);
              ReflectionTestUtils.setField(saved, "id", 400L);
              return saved;
            });

    var result =
        performanceService.startPerformance(
            1L, 10L, new StartPerformanceRequest(200L, 300L));

    assertThat(result.performanceId()).isEqualTo(400L);
    assertThat(result.roundNo()).isEqualTo(3);
    assertThat(result.status()).isEqualTo(PerformanceStatus.PREPARING);
    assertThat(room.getStatus()).isEqualTo(RoomStatus.PLAYING);
    assertThat(room.getVersion()).isEqualTo(2L);

    ArgumentCaptor<PerformanceSettings> settingsCaptor =
        ArgumentCaptor.forClass(PerformanceSettings.class);
    verify(performanceSettingsRepository).save(settingsCaptor.capture());
    assertThat(settingsCaptor.getValue().getTempoPercent()).isEqualTo(100);
    assertThat(settingsCaptor.getValue().getMrVolumePercent()).isEqualTo(100);
    assertThat(settingsCaptor.getValue().getMicVolumePercent()).isEqualTo(100);

    ArgumentCaptor<PerformanceStartedDomainEvent> eventCaptor =
        ArgumentCaptor.forClass(PerformanceStartedDomainEvent.class);
    verify(applicationEventPublisher).publishEvent(eventCaptor.capture());
    assertThat(eventCaptor.getValue().performanceId()).isEqualTo(400L);
    assertThat(eventCaptor.getValue().performerParticipantId()).isEqualTo(200L);
    assertThat(eventCaptor.getValue().songId()).isEqualTo(300L);
    assertThat(eventCaptor.getValue().roundNo()).isEqualTo(3);
    assertThat(eventCaptor.getValue().roomVersion()).isEqualTo(2L);
  }

  @Test
  @DisplayName("방장이 아닌 참가자는 공연을 시작할 수 없다")
  void startPerformance_rejectsNonHost() {
    Room room = room(1L);
    RoomParticipant requester = participant(room, user(10L, "참가자"), 100L);

    when(roomRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(room));
    when(performanceRepository.existsByRoom_IdAndStatusIn(any(), any())).thenReturn(false);
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(1L, 10L))
        .thenReturn(Optional.of(requester));

    assertThatThrownBy(
            () ->
                performanceService.startPerformance(
                    1L, 10L, new StartPerformanceRequest(200L, 300L)))
        .isInstanceOf(PerformanceException.class)
        .hasMessage("방장만 공연을 시작할 수 있습니다.");

    verify(performanceRepository, never()).save(any());
  }

  @Test
  @DisplayName("공연자가 오프라인이면 공연을 시작할 수 없다")
  void startPerformance_rejectsOfflinePerformer() {
    Room room = room(1L);
    RoomParticipant host = host(room, user(10L, "방장"), 100L);
    RoomParticipant performer = participant(room, user(20L, "공연자"), 200L);
    performer.disconnect(NOW_LOCAL);

    when(roomRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(room));
    when(performanceRepository.existsByRoom_IdAndStatusIn(any(), any())).thenReturn(false);
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(1L, 10L))
        .thenReturn(Optional.of(host));
    when(roomParticipantRepository.findByIdAndRoom_Id(200L, 1L))
        .thenReturn(Optional.of(performer));

    assertThatThrownBy(
            () ->
                performanceService.startPerformance(
                    1L, 10L, new StartPerformanceRequest(200L, 300L)))
        .isInstanceOf(PerformanceException.class)
        .hasMessage("온라인 상태의 참가자만 공연자가 될 수 있습니다.");

    verify(songRepository, never()).findById(any());
  }

  @Test
  @DisplayName("전처리가 완료되지 않은 곡으로 공연을 시작할 수 없다")
  void startPerformance_rejectsSongThatIsNotReady() {
    Room room = room(1L);
    RoomParticipant host = host(room, user(10L, "방장"), 100L);
    RoomParticipant performer = participant(room, user(20L, "공연자"), 200L);
    Song song = song(300L, SongStatus.PROCESSING);

    when(roomRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(room));
    when(performanceRepository.existsByRoom_IdAndStatusIn(any(), any())).thenReturn(false);
    when(roomParticipantRepository.findByRoom_IdAndUser_Id(1L, 10L))
        .thenReturn(Optional.of(host));
    when(roomParticipantRepository.findByIdAndRoom_Id(200L, 1L))
        .thenReturn(Optional.of(performer));
    when(songRepository.findById(300L)).thenReturn(Optional.of(song));

    assertThatThrownBy(
            () ->
                performanceService.startPerformance(
                    1L, 10L, new StartPerformanceRequest(200L, 300L)))
        .isInstanceOf(PerformanceException.class)
        .hasMessage("아직 공연할 수 없는 상태의 곡입니다.");

    verify(performanceRepository, never()).save(any());
  }

  @Test
  @DisplayName("같은 방에 활성 공연이 있으면 새로운 공연을 만들지 않는다")
  void startPerformance_rejectsDuplicateActivePerformance() {
    Room room = room(1L);
    when(roomRepository.findByIdForUpdate(1L)).thenReturn(Optional.of(room));
    when(performanceRepository.existsByRoom_IdAndStatusIn(any(), any())).thenReturn(true);

    assertThatThrownBy(
            () ->
                performanceService.startPerformance(
                    1L, 10L, new StartPerformanceRequest(200L, 300L)))
        .isInstanceOf(PerformanceException.class)
        .hasMessage("해당 방에 이미 진행 중인 공연이 있습니다.");

    verify(roomParticipantRepository, never()).findByRoom_IdAndUser_Id(any(), any());
    verify(performanceRepository, never()).save(any());
  }

  private Room room(Long id) {
    Room room =
        Room.create(
            user(1L, "생성자"),
            "ABC123",
            "테스트방",
            RoomMode.GENERAL,
            4,
            "mock-session",
            NOW_LOCAL);
    ReflectionTestUtils.setField(room, "id", id);
    return room;
  }

  private RoomParticipant host(Room room, User user, Long id) {
    RoomParticipant participant = RoomParticipant.host(room, user, NOW_LOCAL);
    ReflectionTestUtils.setField(participant, "id", id);
    return participant;
  }

  private RoomParticipant participant(Room room, User user, Long id) {
    RoomParticipant participant = RoomParticipant.participant(room, user, NOW_LOCAL);
    ReflectionTestUtils.setField(participant, "id", id);
    return participant;
  }

  private Song song(Long id, SongStatus status) {
    Song song = Song.create("테스트 곡", "테스트 가수", status);
    ReflectionTestUtils.setField(song, "id", id);
    return song;
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
}
