package com.ssafy.ssasukae.domain.performanceResult.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.IntStream;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.support.IntegrationTestSupport;

@Transactional
@TestPropertySource(
    properties =
        "AI_UPLOAD_TICKET_SECRET=test-upload-ticket-secret-must-be-at-least-32-bytes")
class PerformanceResultRepositoryIntegrationTest extends IntegrationTestSupport {

  @Autowired private UserRepository userRepository;
  @Autowired private SongRepository songRepository;
  @Autowired private PerformanceResultRepository performanceResultRepository;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private EntityManager entityManager;

  @Test
  @DisplayName("최신순 조회는 11개로 제한하고 복합 커서 다음 결과를 반환한다")
  void findsRecentlyWithCompositeCursor() {
    User user = saveUser("recent-user");
    Song song = songRepository.save(Song.create("최신순 곡", "가수"));
    LocalDateTime baseTime = LocalDateTime.of(2026, 7, 31, 12, 0);

    List<PerformanceResult> saved =
        IntStream.range(0, 13)
            .mapToObj(index -> savePerformance(user, song, 80, baseTime.minusMinutes(index)))
            .toList();

    List<PerformanceResult> firstPage =
        performanceResultRepository.findAllByCriteriaOrderByCreatedAt(
            user, null, 0, 100, null, null);

    assertThat(firstPage).hasSize(11);
    assertThat(firstPage)
        .extracting(PerformanceResult::getCreatedAt)
        .isSortedAccordingTo(java.util.Comparator.reverseOrder());

    PerformanceResult cursor = firstPage.get(9);
    List<PerformanceResult> nextPage =
        performanceResultRepository.findAllByCriteriaOrderByCreatedAt(
            user, null, 0, 100, cursor.getId(), cursor.getCreatedAt());

    assertThat(nextPage)
        .extracting(PerformanceResult::getId)
        .containsExactly(saved.get(10).getId(), saved.get(11).getId(), saved.get(12).getId());
    assertThat(performanceResultRepository.countCriteria(user, null, 0, 100)).isEqualTo(13L);
  }

  @Test
  @DisplayName("점수순 조회는 동점일 때 ID를 보조 커서로 사용하고 다른 사용자를 제외한다")
  void findsHighScoreWithIdTieBreaker() {
    User user = saveUser("score-user");
    User otherUser = saveUser("other-user");
    Song song = songRepository.save(Song.create("점수순 곡", "가수"));
    LocalDateTime createdAt = LocalDateTime.of(2026, 7, 31, 12, 0);

    PerformanceResult first95 = savePerformance(user, song, 95, createdAt);
    PerformanceResult second95 = savePerformance(user, song, 95, createdAt);
    PerformanceResult first90 = savePerformance(user, song, 90, createdAt);
    PerformanceResult second90 = savePerformance(user, song, 90, createdAt);
    savePerformance(otherUser, song, 100, createdAt.plusMinutes(1));

    List<PerformanceResult> firstPage =
        performanceResultRepository.findAllByCriteriaOrderByScore(
            user, null, 0, 100, null, null);

    assertThat(firstPage)
        .extracting(PerformanceResult::getId)
        .containsExactly(
            second95.getId(), first95.getId(), second90.getId(), first90.getId());

    List<PerformanceResult> afterCursor =
        performanceResultRepository.findAllByCriteriaOrderByScore(
            user, null, 0, 100, second95.getId(), second95.getFinalScore());

    assertThat(afterCursor)
        .extracting(PerformanceResult::getId)
        .containsExactly(first95.getId(), second90.getId(), first90.getId());
    assertThat(performanceResultRepository.countCriteria(user, null, 0, 100)).isEqualTo(4L);
  }

  @Test
  @DisplayName("개수 조회는 기간과 점수 범위를 모두 적용한다")
  void countsByPeriodAndScoreRange() {
    User user = saveUser("filter-user");
    Song song = songRepository.save(Song.create("필터 곡", "가수"));
    LocalDateTime startedAt = LocalDateTime.of(2026, 7, 24, 0, 0);

    savePerformance(user, song, 40, startedAt.plusDays(1));
    savePerformance(user, song, 41, startedAt.plusDays(1));
    savePerformance(user, song, 40, startedAt.minusDays(1));

    assertThat(performanceResultRepository.countCriteria(user, startedAt, 0, 40)).isEqualTo(1L);
  }

  private User saveUser(String providerId) {
    return userRepository.save(
        User.builder()
            .email(providerId + "@test.com")
            .nickname(providerId)
            .provider(OAuthProvider.GOOGLE)
            .providerId(providerId)
            .role(Role.USER)
            .build());
  }

  private PerformanceResult savePerformance(
      User user, Song song, int score, LocalDateTime createdAt) {
    PerformanceResult performance =
        PerformanceResult.builder()
            .user(user)
            .song(song)
            .pitchScore(score)
            .rhythmScore(score)
            .lyricsScore(score)
            .stabilityScore(score)
            .finalScore(score)
            .overall("전체 피드백")
            .build();
    PerformanceResult saved = performanceResultRepository.saveAndFlush(performance);
    jdbcTemplate.update(
        "UPDATE performance_results SET created_at = ? WHERE performance_id = ?",
        Timestamp.valueOf(createdAt),
        saved.getId());
    entityManager.clear();
    return performanceResultRepository.findById(saved.getId()).orElseThrow();
  }
}
