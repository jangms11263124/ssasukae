package com.ssafy.ssasukae.domain.feedback.service;

import com.ssafy.ssasukae.domain.feedback.dto.FeedbackResponseDTO;
import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;
import com.ssafy.ssasukae.domain.performanceResult.repository.PerformanceResultRepository;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.entity.UserPerformanceStat;
import com.ssafy.ssasukae.domain.user.repository.UserPerformanceStatRepository;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.performanceAnalysis.PerformanceAnalysisErrorCode;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static com.ssafy.ssasukae.global.exception.performanceAnalysis.PerformanceAnalysisErrorCode.INVALID_REQUEST;
import static com.ssafy.ssasukae.global.exception.performanceAnalysis.PerformanceAnalysisErrorCode.RESOURCE_NOT_FOUND;
import static com.ssafy.ssasukae.global.exception.user.UserErrorCode.USER_NOT_FOUND;

@Service
@RequiredArgsConstructor
@Transactional
public class FeedbackService {
    private static final ZoneId SEOUL_ZONE_ID = ZoneId.of("Asia/Seoul");

    private final UserRepository userRepository;
    private final UserPerformanceStatRepository userPerformanceStatRepository;
    private final PerformanceResultRepository performanceResultRepository;
    private record ScoreCriteria (int minScore, int maxScore) {}
    private record FetchedData(List<PerformanceResult> fetched, Long count) {}
    private final int pageSize = 10;

    public FeedbackResponseDTO.FeedbackSummaryDTO getSummary(AuthenticatedUser authenticatedUser) {
        User user = getUser(authenticatedUser);
        Optional<UserPerformanceStat> stat = userPerformanceStatRepository.findByUser(user);
        UserPerformanceStat beforeStat = stat.orElseGet(() -> UserPerformanceStat.builder()
                .user(user)
                .avgScore(BigDecimal.valueOf(0))
                .total(0L)
                .updatedAt(LocalDateTime.now()).build());

        return FeedbackResponseDTO.FeedbackSummaryDTO.builder()
                .totalSongs(beforeStat.getTotal()).avgScore(beforeStat.getAvgScore()).build();
    }

    public FeedbackResponseDTO.FeedbackListDTO getList(AuthenticatedUser authenticatedUser, String period, String grade, String sort, Long cursor) {
        User user = getUser(authenticatedUser);

        boolean hasNext = false;
        FetchedData fetchedData = findAll(user, period, grade, sort, cursor);
        if(fetchedData.fetched().size() > pageSize) hasNext = true;

        return FeedbackResponseDTO.FeedbackListDTO.builder()
                .feedbacks(fetchedData.fetched().stream().limit(pageSize).map(pr -> {
                    Song song = pr.getSong();

                    return FeedbackResponseDTO.FeedbackItemDTO.builder()
                            .feedbackId(pr.getId())
                            .title(song.getTitle())
                            .artist(song.getArtist())
                            .songId(song.getId())
                            .singAt(toSeoulTime(pr.getCreatedAt()))
                            .thumbnail(song.getThumbnailImageUrl())
                            .overall(pr.getOverall())
                            .score(pr.getFinalScore()).build();
                }).toList())
                .nextCursor(hasNext ? fetchedData.fetched().get(pageSize - 1).getId() : null)
                .hasNext(hasNext)
                .total(fetchedData.count()).build();
    }

    private LocalDateTime toSeoulTime(LocalDateTime utcDateTime) {
        return utcDateTime.atOffset(ZoneOffset.UTC)
                .atZoneSameInstant(SEOUL_ZONE_ID)
                .toLocalDateTime();
    }

    private FetchedData findAll(User user, String period, String grade, String sort, Long cursor) {
        LocalDateTime startedAt = period.equals("All") ? null : LocalDateTime.now().minusDays(Integer.parseInt(period));
        ScoreCriteria score = getScoreCriteria(grade);
        Long count = performanceResultRepository.countCriteria(user, startedAt, score.minScore(), score.maxScore());
        PerformanceResult cursorPerformance = cursor == null ? null : performanceResultRepository.findById(cursor).orElseThrow(() -> new CustomException(RESOURCE_NOT_FOUND));

        return switch(sort) {
            case "recently" -> new FetchedData(performanceResultRepository.findAllByCriteriaOrderByCreatedAt(user, startedAt, score.minScore(), score.maxScore(), cursorPerformance == null ? null : cursorPerformance.getId(), cursorPerformance == null ? null : cursorPerformance.getCreatedAt()), count);
            case "high-score" -> new FetchedData(performanceResultRepository.findAllByCriteriaOrderByScore(user, startedAt, score.minScore(), score.maxScore(), cursorPerformance == null ? null : cursorPerformance.getId(), cursorPerformance == null ? null :  cursorPerformance.getFinalScore()), count);
            default -> throw new CustomException(INVALID_REQUEST);
        };
    }

    private ScoreCriteria getScoreCriteria(String grade) {
        return switch(grade) {
            case "All" -> new ScoreCriteria(0, 100);
            case "S" -> new ScoreCriteria(95, 100);
            case "A" -> new ScoreCriteria(80, 94);
            case "B" -> new ScoreCriteria(65, 79);
            case "C" -> new ScoreCriteria(50, 64);
            case "D" -> new ScoreCriteria(35, 49);
            case "F" -> new ScoreCriteria(0, 34);
            default -> throw new CustomException(INVALID_REQUEST);
        };
    }

    public FeedbackResponseDTO.FeedbackDetailDTO getDetail(AuthenticatedUser authenticatedUser, Long performanceId) {
        User user = getUser(authenticatedUser);
        PerformanceResult performance = performanceResultRepository.findById(performanceId).orElseThrow(() -> new CustomException(INVALID_REQUEST));
        if(!performance.getUser().getId().equals(user.getId())) throw new CustomException(PerformanceAnalysisErrorCode.RESOURCE_NOT_FOUND);
        Song song = performance.getSong();

        return FeedbackResponseDTO.FeedbackDetailDTO.builder()
                .performanceId(performance.getId())
                .title(song.getTitle())
                .artist(song.getArtist())
                .thumbnail(song.getThumbnailImageUrl())
                .scores(FeedbackResponseDTO.ScoreDTO.builder()
                        .pitch(performance.getPitchScore())
                        .rhythm(performance.getRhythmScore())
                        .lyricsAccuracy(performance.getLyricsScore())
                        .stability(performance.getStabilityScore())
                        .difficulty(song.getDifficultyLevel())
                        .total(performance.getFinalScore()).build())
                .overall(performance.getOverall())
                .strength(performance.getStrength())
                .weakness(performance.getWeakness())
                .tip(performance.getTip()).build();
    }

    private User getUser(AuthenticatedUser user) {
        return userRepository.findById(user.userId()).orElseThrow(() -> new CustomException(USER_NOT_FOUND));
    }
}
