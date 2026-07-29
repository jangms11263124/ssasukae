package com.ssafy.ssasukae.domain.feedback.service;

import com.ssafy.ssasukae.domain.feedback.dto.FeedbackResponseDTO;
import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;
import com.ssafy.ssasukae.domain.performanceResult.repository.PerformanceResultRepository;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.entity.UserPerformanceStat;
import com.ssafy.ssasukae.domain.user.repository.UserPerformanceStatRepository;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static com.ssafy.ssasukae.global.exception.user.UserErrorCode.USER_NOT_FOUND;

@Service
@RequiredArgsConstructor
@Transactional
public class FeedbackService {
    private final UserRepository userRepository;
    private final UserPerformanceStatRepository userPerformanceStatRepository;
    private final PerformanceResultRepository performanceResultRepository;

    public FeedbackResponseDTO.FeedbackSummaryDTO getSummary(AuthenticatedUser authenticatedUser) {
        User user = userRepository.findById(authenticatedUser.userId()).orElseThrow(() -> new CustomException(USER_NOT_FOUND));
        Optional<UserPerformanceStat> stat = userPerformanceStatRepository.findByUser(user);
        UserPerformanceStat beforeStat = stat.orElseGet(() -> UserPerformanceStat.builder()
                .user(user)
                .avgScore(BigDecimal.valueOf(0))
                .total(0L)
                .updatedAt(LocalDateTime.now()).build());

        return FeedbackResponseDTO.FeedbackSummaryDTO.builder()
                .totalSongs(beforeStat.getTotal()).avgScore(beforeStat.getAvgScore()).build();
    }
}
