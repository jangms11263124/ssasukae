package com.ssafy.ssasukae.domain.performance.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import com.ssafy.ssasukae.domain.card.repository.CardAssignmentRepository;
import com.ssafy.ssasukae.domain.performance.dto.StartPerformanceRequest;
import com.ssafy.ssasukae.domain.performance.repository.PerformanceRepository;
import com.ssafy.ssasukae.domain.performance.repository.PerformanceSettingsRepository;
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
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.performance.PerformanceException;
import com.ssafy.ssasukae.global.exception.room.RoomException;
import com.ssafy.ssasukae.support.IntegrationTestSupport;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class PerformanceServiceConcurrencyIntegrationTest extends IntegrationTestSupport {

  @Autowired private PerformanceService performanceService;
  @Autowired private CardAssignmentRepository cardAssignmentRepository;
  @Autowired private PerformanceRepository performanceRepository;
  @Autowired private PerformanceSettingsRepository performanceSettingsRepository;
  @Autowired private RoomRepository roomRepository;
  @Autowired private RoomParticipantRepository roomParticipantRepository;
  @Autowired private SongRepository songRepository;
  @Autowired private UserRepository userRepository;
  @Autowired private Clock clock;

  private ExecutorService executorService;
  private Long roomId;
  private Long hostUserId;
  private Long performerParticipantId;
  private Long songId;

  @BeforeEach
  void setUp() {
    cardAssignmentRepository.deleteAllInBatch();
    performanceSettingsRepository.deleteAllInBatch();
    performanceRepository.deleteAllInBatch();
    roomParticipantRepository.deleteAllInBatch();
    roomRepository.deleteAllInBatch();
    songRepository.deleteAllInBatch();
    userRepository.deleteAllInBatch();

    LocalDateTime now = LocalDateTime.now(clock);
    User hostUser = userRepository.save(user("host@test.com", "방장", "host-provider"));
    User performerUser =
        userRepository.save(user("performer@test.com", "공연자", "performer-provider"));

    Room room =
        roomRepository.save(
            Room.create(
                hostUser,
                "ABC123",
                "동시성 테스트방",
                RoomMode.GENERAL,
                4,
                "mock-session",
                now));
    roomId = room.getId();
    hostUserId = hostUser.getId();

    roomParticipantRepository.save(RoomParticipant.host(room, hostUser, now));
    RoomParticipant performer =
        roomParticipantRepository.save(RoomParticipant.participant(room, performerUser, now));
    performerParticipantId = performer.getId();

    Song song = songRepository.save(Song.create("테스트 곡", "테스트 가수", SongStatus.READY));
    songId = song.getId();

    executorService = Executors.newFixedThreadPool(2);
  }

  @AfterEach
  void tearDown() {
    executorService.shutdownNow();
  }

  @Test
  void concurrentStartRequestsCreateOnlyOnePerformance() throws Exception {
    CountDownLatch ready = new CountDownLatch(2);
    CountDownLatch start = new CountDownLatch(1);
    StartPerformanceRequest request =
        new StartPerformanceRequest(performerParticipantId, songId);

    List<Future<Boolean>> futures =
        List.of(
            executorService.submit(() -> startOnce(ready, start, request)),
            executorService.submit(() -> startOnce(ready, start, request)));

    ready.await();
    start.countDown();

    long successCount = 0;
    for (Future<Boolean> future : futures) {
      if (future.get()) {
        successCount++;
      }
    }

    assertThat(successCount).isEqualTo(1);
    assertThat(performanceRepository.count()).isEqualTo(1);
    assertThat(performanceSettingsRepository.count()).isEqualTo(1);
    assertThat(cardAssignmentRepository.count()).isEqualTo(1);
    assertThat(roomRepository.findById(roomId).orElseThrow().getStatus())
        .isEqualTo(RoomStatus.PLAYING);
  }

  private boolean startOnce(
      CountDownLatch ready,
      CountDownLatch start,
      StartPerformanceRequest request)
      throws InterruptedException {
    ready.countDown();
    start.await();
    try {
      performanceService.startPerformance(roomId, hostUserId, request);
      return true;
    } catch (PerformanceException | RoomException expected) {
      return false;
    }
  }

  private User user(String email, String nickname, String providerId) {
    return User.builder()
        .email(email)
        .nickname(nickname)
        .provider(OAuthProvider.GOOGLE)
        .providerId(providerId)
        .role(Role.USER)
        .build();
  }
}
