package com.ssafy.ssasukae.domain.feedback.service;

import static com.ssafy.ssasukae.global.exception.performanceAnalysis.PerformanceAnalysisErrorCode.INVALID_REQUEST;
import static com.ssafy.ssasukae.global.exception.performanceAnalysis.PerformanceAnalysisErrorCode.RESOURCE_NOT_FOUND;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.ssafy.ssasukae.domain.feedback.dto.FeedbackResponseDTO;
import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;
import com.ssafy.ssasukae.domain.performanceResult.repository.PerformanceResultRepository;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserPerformanceStatRepository;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

@ExtendWith(MockitoExtension.class)
class FeedbackServiceTest {

  private static final Long USER_ID = 1L;
  private static final AuthenticatedUser AUTHENTICATED_USER =
      new AuthenticatedUser(USER_ID, "user@test.com", "USER");

  @Mock private UserRepository userRepository;
  @Mock private UserPerformanceStatRepository userPerformanceStatRepository;
  @Mock private PerformanceResultRepository performanceResultRepository;

  private FeedbackService feedbackService;
  private User user;
  private Song song;

  @BeforeEach
  void setUp() {
    feedbackService =
        new FeedbackService(
            userRepository, userPerformanceStatRepository, performanceResultRepository);
    user = user(USER_ID);
    song = song(10L);

    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
  }

  @Test
  @DisplayName("최신순 첫 페이지는 10개와 다음 커서를 반환한다")
  void getListReturnsTenItemsAndNextCursorForRecently() {
    List<PerformanceResult> fetched =
        IntStream.range(0, 11)
            .mapToObj(index -> performance(100L - index, 80, LocalDateTime.now().minusMinutes(index)))
            .toList();

    when(performanceResultRepository.countCriteria(
            eq(user), any(LocalDateTime.class), eq(0), eq(100)))
        .thenReturn(12L);
    when(performanceResultRepository.findAllByCriteriaOrderByCreatedAt(
            eq(user),
            any(LocalDateTime.class),
            eq(0),
            eq(100),
            isNull(),
            isNull()))
        .thenReturn(fetched);

    FeedbackResponseDTO.FeedbackListDTO response =
        feedbackService.getList(AUTHENTICATED_USER, "30", "All", "recently", null);

    assertThat(response.getFeedbacks()).hasSize(10);
    assertThat(response.getFeedbacks().get(0).getFeedbackId()).isEqualTo(100L);
    assertThat(response.getFeedbacks().get(0).getSongId()).isEqualTo(10L);
    assertThat(response.getFeedbacks().get(0).getTitle()).isEqualTo("테스트 곡");
    assertThat(response.getNextCursor()).isEqualTo(91L);
    assertThat(response.isHasNext()).isTrue();
    assertThat(response.getTotal()).isEqualTo(12L);
  }

  @Test
  @DisplayName("피드백 생성 시각을 한국 시간으로 반환한다")
  void getListReturnsSingAtInSeoulTime() {
    LocalDateTime createdAtUtc = LocalDateTime.of(2026, 8, 5, 6, 30);
    when(performanceResultRepository.countCriteria(user, null, 0, 100)).thenReturn(1L);
    when(performanceResultRepository.findAllByCriteriaOrderByCreatedAt(
            user, null, 0, 100, null, null))
        .thenReturn(List.of(performance(100L, 80, createdAtUtc)));

    FeedbackResponseDTO.FeedbackListDTO response =
        feedbackService.getList(AUTHENTICATED_USER, "All", "All", "recently", null);

    assertThat(response.getFeedbacks().get(0).getSingAt())
        .isEqualTo(LocalDateTime.of(2026, 8, 5, 15, 30));
  }

  @Test
  @DisplayName("점수순 다음 페이지는 커서의 ID와 점수를 Repository에 전달한다")
  void getListPassesCursorIdAndScoreForHighScore() {
    PerformanceResult cursor = performance(77L, 92, LocalDateTime.now());
    List<PerformanceResult> fetched =
        List.of(
            performance(70L, 91, LocalDateTime.now().minusMinutes(1)),
            performance(69L, 90, LocalDateTime.now().minusMinutes(2)));

    when(performanceResultRepository.countCriteria(user, null, 90, 94)).thenReturn(3L);
    when(performanceResultRepository.findById(77L)).thenReturn(Optional.of(cursor));
    when(performanceResultRepository.findAllByCriteriaOrderByScore(
            user, null, 90, 94, 77L, 92))
        .thenReturn(fetched);

    FeedbackResponseDTO.FeedbackListDTO response =
        feedbackService.getList(AUTHENTICATED_USER, "All", "A", "high-score", 77L);

    assertThat(response.getFeedbacks()).extracting("score").containsExactly(91, 90);
    assertThat(response.getNextCursor()).isNull();
    assertThat(response.isHasNext()).isFalse();
    assertThat(response.getTotal()).isEqualTo(3L);
    verify(performanceResultRepository)
        .findAllByCriteriaOrderByScore(user, null, 90, 94, 77L, 92);
  }

  @Test
  @DisplayName("F 등급과 7일 조건을 Repository 조회와 개수 계산에 전달한다")
  void getListPassesPeriodAndFGradeCriteria() {
    when(performanceResultRepository.countCriteria(
            eq(user), any(LocalDateTime.class), eq(0), eq(40)))
        .thenReturn(0L);
    when(performanceResultRepository.findAllByCriteriaOrderByCreatedAt(
            eq(user),
            any(LocalDateTime.class),
            eq(0),
            eq(40),
            isNull(),
            isNull()))
        .thenReturn(List.of());

    FeedbackResponseDTO.FeedbackListDTO response =
        feedbackService.getList(AUTHENTICATED_USER, "7", "F", "recently", null);

    assertThat(response.getFeedbacks()).isEmpty();
    assertThat(response.getNextCursor()).isNull();
    assertThat(response.isHasNext()).isFalse();
    assertThat(response.getTotal()).isZero();
  }

  @Test
  @DisplayName("존재하지 않는 커서는 리소스 없음 예외를 발생시킨다")
  void getListRejectsMissingCursor() {
    when(performanceResultRepository.countCriteria(user, null, 0, 100)).thenReturn(0L);
    when(performanceResultRepository.findById(999L)).thenReturn(Optional.empty());

    assertThatThrownBy(
            () -> feedbackService.getList(AUTHENTICATED_USER, "All", "All", "recently", 999L))
        .isInstanceOfSatisfying(
            CustomException.class,
            exception -> assertThat(exception.getErrorCode()).isEqualTo(RESOURCE_NOT_FOUND));
  }

  @Test
  @DisplayName("지원하지 않는 정렬 방식은 잘못된 요청 예외를 발생시킨다")
  void getListRejectsUnsupportedSort() {
    when(performanceResultRepository.countCriteria(user, null, 0, 100)).thenReturn(0L);

    assertThatThrownBy(
            () -> feedbackService.getList(AUTHENTICATED_USER, "All", "All", "oldest", null))
        .isInstanceOfSatisfying(
            CustomException.class,
            exception -> assertThat(exception.getErrorCode()).isEqualTo(INVALID_REQUEST));
  }

  private User user(Long id) {
    User result =
        User.builder()
            .email("user@test.com")
            .nickname("tester")
            .provider(OAuthProvider.GOOGLE)
            .providerId("google-user")
            .role(Role.USER)
            .build();
    ReflectionTestUtils.setField(result, "id", id);
    return result;
  }

  private Song song(Long id) {
    Song result = Song.create("테스트 곡", "테스트 가수");
    ReflectionTestUtils.setField(result, "id", id);
    return result;
  }

  private PerformanceResult performance(Long id, int score, LocalDateTime createdAt) {
    PerformanceResult result =
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
    ReflectionTestUtils.setField(result, "id", id);
    ReflectionTestUtils.setField(result, "createdAt", createdAt);
    return result;
  }
}
