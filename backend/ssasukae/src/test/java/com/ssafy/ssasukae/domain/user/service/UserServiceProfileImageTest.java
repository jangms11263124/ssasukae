package com.ssafy.ssasukae.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import com.ssafy.ssasukae.domain.favorite.repository.FavoriteRepository;
import com.ssafy.ssasukae.domain.performanceResult.repository.PerformanceResultRepository;
import com.ssafy.ssasukae.domain.user.dto.ProfileImageChangeResponseDTO;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserPerformanceStatRepository;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.user.UserErrorCode;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import com.ssafy.ssasukae.integration.aws.S3StorageService;

@ExtendWith(MockitoExtension.class)
class UserServiceProfileImageTest {

  private static final Long USER_ID = 1L;
  private static final String OLD_PROFILE_URL = "https://example.com/old.png";
  private static final String PROFILE_KEY = "users/1/profile.png";
  private static final String PROFILE_URL = "https://bucket.example.com/users/1/profile.png";
  private static final AuthenticatedUser AUTHENTICATED_USER =
      new AuthenticatedUser(USER_ID, "user@test.com", "USER");

  @Mock private UserRepository userRepository;
  @Mock private FavoriteRepository favoriteRepository;
  @Mock private PerformanceResultRepository performanceResultRepository;
  @Mock private UserPerformanceStatRepository userPerformanceStatRepository;
  @Mock private S3StorageService s3StorageService;

  private UserService userService;

  @BeforeEach
  void setUp() {
    userService =
        new UserService(
            userRepository,
            favoriteRepository,
            performanceResultRepository,
            userPerformanceStatRepository,
            s3StorageService);
  }

  @ParameterizedTest
  @ValueSource(strings = {"image/jpeg", "image/png", "image/webp"})
  @DisplayName("허용된 이미지 타입은 S3에 업로드하고 프로필 URL을 변경한다")
  void changesProfileImageForAllowedContentTypes(String contentType) {
    User user = user();
    MockMultipartFile image = image(contentType);

    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
    when(s3StorageService.uploadProfileImage(image, USER_ID)).thenReturn(PROFILE_KEY);
    when(s3StorageService.publicUrl(PROFILE_KEY)).thenReturn(PROFILE_URL);

    ProfileImageChangeResponseDTO response =
        userService.changeProfileImage(AUTHENTICATED_USER, image);

    assertThat(response.url()).isEqualTo(PROFILE_URL);
    assertThat(user.getProfileImageUrl()).isEqualTo(PROFILE_URL);
    verify(s3StorageService).uploadProfileImage(image, USER_ID);
    verify(s3StorageService).publicUrl(PROFILE_KEY);
  }

  @Test
  @DisplayName("null 파일은 잘못된 요청으로 거부한다")
  void rejectsNullImage() {
    User user = user();
    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));

    assertInvalidRequest(null);

    assertThat(user.getProfileImageUrl()).isEqualTo(OLD_PROFILE_URL);
    verifyNoInteractions(s3StorageService);
  }

  @Test
  @DisplayName("빈 파일은 잘못된 요청으로 거부한다")
  void rejectsEmptyImage() {
    User user = user();
    MockMultipartFile emptyImage =
        new MockMultipartFile("profile-image", "profile.png", "image/png", new byte[0]);
    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));

    assertInvalidRequest(emptyImage);

    assertThat(user.getProfileImageUrl()).isEqualTo(OLD_PROFILE_URL);
    verifyNoInteractions(s3StorageService);
  }

  @Test
  @DisplayName("지원하지 않는 MIME 타입은 잘못된 요청으로 거부한다")
  void rejectsUnsupportedContentType() {
    User user = user();
    MockMultipartFile gifImage = image("image/gif");
    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));

    assertInvalidRequest(gifImage);

    assertThat(user.getProfileImageUrl()).isEqualTo(OLD_PROFILE_URL);
    verifyNoInteractions(s3StorageService);
  }

  @Test
  @DisplayName("존재하지 않는 사용자는 S3 업로드를 수행하지 않는다")
  void rejectsMissingUser() {
    MockMultipartFile image = image("image/png");
    when(userRepository.findById(USER_ID)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> userService.changeProfileImage(AUTHENTICATED_USER, image))
        .isInstanceOfSatisfying(
            CustomException.class,
            exception -> assertThat(exception.getErrorCode()).isEqualTo(UserErrorCode.USER_NOT_FOUND));

    verifyNoInteractions(s3StorageService);
  }

  @Test
  @DisplayName("S3 업로드가 실패하면 기존 프로필 URL을 유지한다")
  void keepsExistingProfileImageWhenUploadFails() {
    User user = user();
    MockMultipartFile image = image("image/png");
    RuntimeException uploadFailure = new RuntimeException("S3 upload failed");

    when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
    when(s3StorageService.uploadProfileImage(image, USER_ID)).thenThrow(uploadFailure);

    assertThatThrownBy(() -> userService.changeProfileImage(AUTHENTICATED_USER, image))
        .isSameAs(uploadFailure);

    assertThat(user.getProfileImageUrl()).isEqualTo(OLD_PROFILE_URL);
  }

  private void assertInvalidRequest(MockMultipartFile image) {
    assertThatThrownBy(() -> userService.changeProfileImage(AUTHENTICATED_USER, image))
        .isInstanceOfSatisfying(
            CustomException.class,
            exception -> assertThat(exception.getErrorCode()).isEqualTo(UserErrorCode.INVALID_REQUEST));
  }

  private MockMultipartFile image(String contentType) {
    return new MockMultipartFile(
        "profile-image", "profile.png", contentType, "image-content".getBytes());
  }

  private User user() {
    User user =
        User.builder()
            .email("user@test.com")
            .nickname("tester")
            .profileImageUrl(OLD_PROFILE_URL)
            .provider(OAuthProvider.GOOGLE)
            .providerId("google-user")
            .role(Role.USER)
            .build();
    ReflectionTestUtils.setField(user, "id", USER_ID);
    return user;
  }
}
