package com.ssafy.ssasukae.domain.user.service;

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

import java.util.Optional;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

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
        return null;
    }

    @Transactional(readOnly = true)
    public boolean isNicknameAvailable(String nickname) {
        if (!StringUtils.hasText(nickname)) {
            throw new CustomException(UserErrorCode.NICKNAME_REQUIRED);
        }

        return !userRepository.existsByNickname(nickname);
    }
}