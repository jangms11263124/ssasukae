package com.ssafy.ssasukae.domain.song.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.ssafy.ssasukae.domain.song.dto.SongAnalysisResultResponse;
import com.ssafy.ssasukae.domain.song.service.SongAnalysisService;
import com.ssafy.ssasukae.integration.ai.AiServerAuthenticator;

import lombok.RequiredArgsConstructor;

/**
 * AI 서버가 곡 분석을 끝낸 뒤 결과를 넘겨주는 콜백. AI 서버는 우리 DB에 직접 접근하지 않고,
 * 이 엔드포인트를 통해 백엔드에 저장을 요청할 뿐이다. 이 시점에 처음이자 마지막으로 Song row가 생성된다.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/internal/api/songs")
public class SongAnalysisCallbackController {

    public static final String AI_API_KEY_HEADER = "X-AI-API-Key";

    private final AiServerAuthenticator aiServerAuthenticator;
    private final SongAnalysisService songAnalysisService;

    @PostMapping(value = "/analysis-result", consumes = "multipart/form-data")
    public ResponseEntity<SongAnalysisResultResponse> receiveAnalysisResult(
            @RequestHeader(value = AI_API_KEY_HEADER, required = false) String apiKey,
            @RequestParam String title,
            @RequestParam String artist,
            @RequestParam Integer difficulty,
            @RequestParam Integer duration,
            @RequestPart MultipartFile albumImg,
            @RequestPart MultipartFile lyrics,
            @RequestPart MultipartFile midi,
            @RequestPart MultipartFile mr
    ) {
        aiServerAuthenticator.authenticate(apiKey);

        Long songId = songAnalysisService.registerAnalyzedSong(
                title, artist, duration, difficulty, albumImg, lyrics, midi, mr);

        return ResponseEntity.ok(new SongAnalysisResultResponse(songId));
    }
}
