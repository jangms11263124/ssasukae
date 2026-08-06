package com.ssafy.ssasukae.domain.user.service;

import com.ssafy.ssasukae.domain.favorite.dto.FavoriteResponseDTO;
import com.ssafy.ssasukae.domain.favorite.entity.Favorite;
import com.ssafy.ssasukae.domain.favorite.repository.FavoriteRepository;
import com.ssafy.ssasukae.domain.performance.dto.PerformanceResponseDTO;
import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;
import com.ssafy.ssasukae.domain.performanceResult.repository.PerformanceResultRepository;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.user.dto.MyPageResponse;
import com.ssafy.ssasukae.domain.user.dto.NicknameRequest;
import com.ssafy.ssasukae.domain.user.dto.PerformanceStatResponse;
import com.ssafy.ssasukae.domain.user.dto.ProfileImageChangeResponseDTO;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.entity.UserPerformanceStat;
import com.ssafy.ssasukae.domain.user.repository.UserPerformanceStatRepository;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.BaseErrorCode;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.user.UserErrorCode;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

import com.ssafy.ssasukae.integration.aws.S3StorageService;
import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class UserService {

    private static final ZoneId SEOUL_ZONE_ID = ZoneId.of("Asia/Seoul");

    private static final List<String> ALLOWED_PROFILE_IMAGE_TYPES = List.of(
            "image/jpeg",
            "image/png",
            "image/webp"
    );

    private final UserRepository userRepository;
    private final FavoriteRepository favoriteRepository;
    private final PerformanceResultRepository performanceResultRepository;
    private final UserPerformanceStatRepository userPerformanceStatRepository;
    private final S3StorageService s3StorageService;

    public Optional<User> findByProviderAndProviderId(OAuthProvider provider, String providerId) {
        return userRepository.findByProviderAndProviderId(provider, providerId);
    }

    @Transactional
    public User createOAuthUser(
            OAuthProvider provider,
            String providerId,
            String email,
            String nickname,
            String profileImageUrl
    ) {
        User user = User.builder()
                .email(email)
                .nickname(nickname)
                .profileImageUrl(profileImageUrl)
                .provider(provider)
                .providerId(providerId)
                .role(Role.USER)
                .build();

        return userRepository.save(user);
    }

    @Transactional(readOnly = true)
    public User findById(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new CustomException(UserErrorCode.USER_NOT_FOUND));
    }

    @Transactional
    public MyPageResponse getMyPage(AuthenticatedUser authenticatedUser) {
        User user = userRepository.findById(authenticatedUser.userId()).orElseThrow(() -> new CustomException(UserErrorCode.USER_NOT_FOUND));
        int favoritesCnt = favoriteRepository.countByUser(user);
        List<Favorite> recentFavorites = favoriteRepository.findRecentFavor(user);
        List<PerformanceResult> recentPerformances = performanceResultRepository.findNRecentPerformances(user, 3);

        return MyPageResponse.builder()
                .userId(user.getId())
                .nickname(user.getNickname())
                .provider(user.getProvider().name())
                .email(user.getEmail())
                .profileImageUrl(user.getProfileImageUrl())
                .createdAt(toSeoulTime(user.getCreatedAt()))
                .favorites(FavoriteResponseDTO.SimpleFavoriteDTO.builder()
                        .count(favoritesCnt)
                        .items(recentFavorites.stream().map(f -> {
                            Song song = f.getSong();

                            return FavoriteResponseDTO.SongItemDTO.builder()
                                    .songId(song.getId())
                                    .title(song.getTitle())
                                    .artist(song.getArtist())
                                    .thumbnailUrl(song.getThumbnailImageUrl())
                                    .durationSeconds(song.getDuration())
                                    .favoritedAt(toSeoulTime(f.getCreatedAt())).build();
                        }).toList()).build())
                .recentPerformances(recentPerformances.stream().map(p -> {
                    Song song = p.getSong();

                    return PerformanceResponseDTO.RecentPerformanceDTO.builder()
                            .performanceId(p.getId())
                            .title(song.getTitle())
                            .artist(song.getArtist())
                            .thumbnailUrl(song.getThumbnailImageUrl())
                            .score(p.getFinalScore())
                            .performanceAt(toSeoulTime(p.getCreatedAt())).build();
                }).toList()).build();
    }

    @Transactional(readOnly = true)
    public boolean isNicknameAvailable(String nickname) {
        if (!StringUtils.hasText(nickname)) {
            throw new CustomException(UserErrorCode.NICKNAME_REQUIRED);
        }

        return !userRepository.existsByNickname(nickname);
    }

    @Transactional
    public void changeNickname(AuthenticatedUser authenticatedUser, NicknameRequest requestBody) {
        User user = findById(authenticatedUser.userId());
        String request = requestBody.getNickname().trim();
        if(request.isEmpty()) throw new CustomException(UserErrorCode.NICKNAME_REQUIRED);
        if(!isNicknameAvailable(request)) throw new CustomException(UserErrorCode.NICKNAME_DUPLICATED);

        user.updateNickname(request);
        userRepository.save(user);
    }

    @Transactional
    public ProfileImageChangeResponseDTO changeProfileImage(AuthenticatedUser authenticatedUser, MultipartFile profileImage) {
        User user = findById(authenticatedUser.userId());
        if(profileImage == null || profileImage.isEmpty()) throw new CustomException(UserErrorCode.INVALID_REQUEST);
        if(!ALLOWED_PROFILE_IMAGE_TYPES.contains(profileImage.getContentType())) throw new CustomException(UserErrorCode.INVALID_REQUEST);

        String url = s3StorageService.publicUrl(s3StorageService.uploadProfileImage(profileImage, user.getId()));
        user.updateProfileImageUrl(url);
        return new ProfileImageChangeResponseDTO(url);
    }

    @Transactional
    public PerformanceStatResponse refreshPerformanceStat(AuthenticatedUser authenticatedUser) {
        User user = userRepository.findById(authenticatedUser.userId()).orElseThrow(() -> new CustomException(UserErrorCode.USER_NOT_FOUND));
        UserPerformanceStat beforeStat = userPerformanceStatRepository.findByUser(user).orElseGet(() ->
                UserPerformanceStat.builder()
                        .user(user)
                        .total(0L)
                        .avgScore(BigDecimal.valueOf(0))
                        .updatedAt(LocalDateTime.now()).build()
        );

        List<PerformanceResult> recentPerforms = performanceResultRepository.findNRecentPerformances(user, 10);
        Long perFormsCnt = performanceResultRepository.countByUser(user);
        beforeStat.setTotal(perFormsCnt);
        BigDecimal newAvg = average(recentPerforms);
        BigDecimal difference = newAvg.subtract(beforeStat.getAvgScore());
        beforeStat.setAvgScore(newAvg);
        UserPerformanceStat newStat = userPerformanceStatRepository.save(beforeStat);

        return PerformanceStatResponse.builder()
                .avgScore(newAvg)
                .difference(difference)
                .totalSongs(newStat.getTotal())
                .updatedAt(toSeoulTime(newStat.getUpdatedAt())).build();
    }

    private LocalDateTime toSeoulTime(LocalDateTime utcDateTime) {
        if (utcDateTime == null) {
            return null;
        }

        return utcDateTime.atOffset(ZoneOffset.UTC)
                .atZoneSameInstant(SEOUL_ZONE_ID)
                .toLocalDateTime();
    }

    private BigDecimal average(List<PerformanceResult> items) {
        if (items.isEmpty()) {
            return BigDecimal.ZERO;
        }

        BigDecimal sum = items.stream()
                .map(PerformanceResult::getFinalScore)
                .map(BigDecimal::valueOf)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return sum.divide(
                BigDecimal.valueOf(items.size()),
                1,
                RoundingMode.HALF_UP
        );
    }
}
