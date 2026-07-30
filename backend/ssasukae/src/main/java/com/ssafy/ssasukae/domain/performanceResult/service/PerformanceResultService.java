package com.ssafy.ssasukae.domain.performanceResult.service;

import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultRequestDTO;
import com.ssafy.ssasukae.domain.performanceResult.dto.PerformanceResultResponseDTO;
import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;
import com.ssafy.ssasukae.domain.performanceResult.repository.PerformanceResultRepository;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.song.SongErrorCode;
import com.ssafy.ssasukae.global.exception.user.UserErrorCode;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PerformanceResultService {
    private final UserRepository userRepository;
    private final SongRepository songRepository;
    private final PerformanceResultRepository performanceResultRepository;

    public PerformanceResultResponseDTO.PerformanceIdDTO getScore(PerformanceResultRequestDTO.ScoreDTO request) {
        User user = userRepository.findById(request.getUserId()).orElseThrow(() -> new CustomException(UserErrorCode.USER_NOT_FOUND));
        Song song = songRepository.findById(request.getSongId()).orElseThrow(() -> new CustomException(SongErrorCode.SONG_NOT_FOUND));
        PerformanceResult pr = PerformanceResult.builder()
                .user(user)
                .song(song)
                .pitchScore(request.getPitchScore())
                .lyricsScore(request.getLyricsScore())
                .rhythmScore(request.getRhythmScore())
                .stabilityScore(request.getStabilityScore())
                .finalScore(request.getFinalScore())
                .overall(request.getOverall())
                .strength(request.getStrength())
                .weakness(request.getWeakness())
                .tip(request.getTips()).build();

        PerformanceResult saved = performanceResultRepository.save(pr);
        return PerformanceResultResponseDTO.PerformanceIdDTO.builder()
                .performanceId(saved.getId()).build();
    }
}
