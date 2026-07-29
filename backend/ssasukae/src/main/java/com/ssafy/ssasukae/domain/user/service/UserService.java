package com.ssafy.ssasukae.domain.user.service;

import com.ssafy.ssasukae.domain.favorite.dto.FavoriteResponseDTO;
import com.ssafy.ssasukae.domain.favorite.entity.Favorite;
import com.ssafy.ssasukae.domain.favorite.repository.FavoriteRepository;
import com.ssafy.ssasukae.domain.performance.dto.PerformanceResponseDTO;
import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;
import com.ssafy.ssasukae.domain.performanceResult.repository.PerformanceResultRepository;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.user.dto.MyPageResponse;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.domain.user.type.OAuthProvider;
import com.ssafy.ssasukae.domain.user.type.Role;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.user.UserErrorCode;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final FavoriteRepository favoriteRepository;
    private final PerformanceResultRepository performanceResultRepository;

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
                .createdAt(user.getCreatedAt())
                .favorites(FavoriteResponseDTO.SimpleFavoriteDTO.builder()
                        .count(favoritesCnt)
                        .items(recentFavorites.stream().map(f -> {
                            Song song = f.getSong();

                            return FavoriteResponseDTO.SongItemDTO.builder()
                                    .songId(song.getId())
                                    .title(song.getTitle())
                                    .artist(song.getArtist())
                                    .thumbnailUrl(song.getCoverObjectKey())
                                    .favoritedAt(f.getCreatedAt()).build();
                        }).toList()).build())
                .recentPerformances(recentPerformances.stream().map(p -> {
                    Song song = p.getSong();

                    return PerformanceResponseDTO.RecentPerformanceDTO.builder()
                            .performanceId(p.getId())
                            .title(song.getTitle())
                            .artist(song.getArtist())
                            .thumbnailUrl(song.getCoverObjectKey())
                            .score(p.getFinalScore()).build();
                }).toList()).build();
    }

    @Transactional(readOnly = true)
    public boolean isNicknameAvailable(String nickname) {
        if (!StringUtils.hasText(nickname)) {
            throw new CustomException(UserErrorCode.NICKNAME_REQUIRED);
        }

        return !userRepository.existsByNickname(nickname);
    }
}