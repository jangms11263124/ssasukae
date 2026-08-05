package com.ssafy.ssasukae.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.ssafy.ssasukae.domain.favorite.entity.Favorite;
import com.ssafy.ssasukae.domain.favorite.repository.FavoriteRepository;
import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;
import com.ssafy.ssasukae.domain.performanceResult.repository.PerformanceResultRepository;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.user.dto.MyPageResponse;
import com.ssafy.ssasukae.domain.user.dto.PerformanceStatResponse;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.entity.UserPerformanceStat;
import com.ssafy.ssasukae.domain.user.repository.UserPerformanceStatRepository;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import com.ssafy.ssasukae.integration.aws.S3StorageService;

@ExtendWith(MockitoExtension.class)
class UserServiceTimeZoneTest {

  private static final Long USER_ID = 1L;
  private static final LocalDateTime UTC_TIME = LocalDateTime.of(2026, 8, 5, 6, 30);
  private static final LocalDateTime SEOUL_TIME = LocalDateTime.of(2026, 8, 5, 15, 30);
  private static final AuthenticatedUser AUTHENTICATED_USER =
      new AuthenticatedUser(USER_ID, "user@test.com", "USER");

  @Mock private UserRepository userRepository;
  @Mock private FavoriteRepository favoriteRepository;
  @Mock private PerformanceResultRepository performanceResultRepository;
  @Mock private UserPerformanceStatRepository userPerformanceStatRepository;
  @Mock private S3StorageService s3StorageService;

  private UserService userService;
  private User user;

  @BeforeEach
  void setUp() {
    userService =
        new UserService(
            userRepository,
            favoriteRepository,
            performanceResultRepository,
            userPerformanceStatRepository,
            s3StorageService);
    user = user();
    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
  }

  @Test
  @DisplayName("마이페이지의 모든 시각을 한국 시간으로 반환한다")
  void getMyPageReturnsTimesInSeoulTime() {
    Song song = song();
    Favorite favorite =
        Favorite.builder().favoriteId(1L).user(user).song(song).createdAt(UTC_TIME).build();
    PerformanceResult performance = performance(song);

    when(favoriteRepository.countByUser(user)).thenReturn(1);
    when(favoriteRepository.findRecentFavor(user)).thenReturn(List.of(favorite));
    when(performanceResultRepository.findNRecentPerformances(user, 3))
        .thenReturn(List.of(performance));

    MyPageResponse response = userService.getMyPage(AUTHENTICATED_USER);

    assertThat(response.getCreatedAt()).isEqualTo(SEOUL_TIME);
    assertThat(response.getFavorites().getItems().get(0).getFavoritedAt()).isEqualTo(SEOUL_TIME);
    assertThat(response.getRecentPerformances().get(0).getPerformanceAt()).isEqualTo(SEOUL_TIME);
  }

  @Test
  @DisplayName("공연 통계 갱신 시각을 한국 시간으로 반환한다")
  void refreshPerformanceStatReturnsUpdatedAtInSeoulTime() {
    UserPerformanceStat stat =
        UserPerformanceStat.builder()
            .user(user)
            .total(0L)
            .avgScore(BigDecimal.ZERO)
            .updatedAt(UTC_TIME)
            .build();
    when(userPerformanceStatRepository.findByUser(user)).thenReturn(Optional.of(stat));
    when(performanceResultRepository.findNRecentPerformances(user, 10)).thenReturn(List.of());
    when(performanceResultRepository.countByUser(user)).thenReturn(0L);
    when(userPerformanceStatRepository.save(stat)).thenReturn(stat);

    PerformanceStatResponse response = userService.refreshPerformanceStat(AUTHENTICATED_USER);

    assertThat(response.getUpdatedAt()).isEqualTo(SEOUL_TIME);
  }

  private User user() {
    User result =
        User.builder()
            .email("user@test.com")
            .nickname("tester")
            .provider(OAuthProvider.GOOGLE)
            .providerId("google-user")
            .role(Role.USER)
            .build();
    ReflectionTestUtils.setField(result, "id", USER_ID);
    ReflectionTestUtils.setField(result, "createdAt", UTC_TIME);
    return result;
  }

  private Song song() {
    Song result = Song.create("테스트 곡", "테스트 가수");
    ReflectionTestUtils.setField(result, "id", 10L);
    return result;
  }

  private PerformanceResult performance(Song song) {
    PerformanceResult result =
        PerformanceResult.builder()
            .user(user)
            .song(song)
            .pitchScore(80)
            .rhythmScore(80)
            .lyricsScore(80)
            .stabilityScore(80)
            .finalScore(80)
            .build();
    ReflectionTestUtils.setField(result, "id", 100L);
    ReflectionTestUtils.setField(result, "createdAt", UTC_TIME);
    return result;
  }
}
