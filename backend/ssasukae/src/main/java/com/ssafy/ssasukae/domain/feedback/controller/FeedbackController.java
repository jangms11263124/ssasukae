package com.ssafy.ssasukae.domain.feedback.controller;

import com.ssafy.ssasukae.domain.feedback.dto.FeedbackResponseDTO;
import com.ssafy.ssasukae.domain.feedback.service.FeedbackService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/users/me")
public class FeedbackController {
    private final FeedbackService feedbackService;

    @GetMapping("/feedback/summary")
    public ResponseEntity<FeedbackResponseDTO.FeedbackSummaryDTO> getSummary(@AuthenticationPrincipal AuthenticatedUser authenticatedUser) {
        FeedbackResponseDTO.FeedbackSummaryDTO data = feedbackService.getSummary(authenticatedUser);
        return ResponseEntity.ok(data);
    }

    @GetMapping("/performances/{performanceId}")
    public ResponseEntity<FeedbackResponseDTO.FeedbackDetailDTO> getDetailFeedback(@AuthenticationPrincipal AuthenticatedUser authenticatedUser, @PathVariable Long performanceId) {
        FeedbackResponseDTO.FeedbackDetailDTO data = feedbackService.getDetail(authenticatedUser, performanceId);
        return ResponseEntity.ok(data);
    }

    @GetMapping("/performances")
    public ResponseEntity<FeedbackResponseDTO.FeedbackListDTO> getList(
            @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
            @RequestParam(defaultValue = "30") String period,
            @RequestParam(defaultValue = "All") String grade,
            @RequestParam(defaultValue = "recently") String sort,
            @RequestParam(required = false) Long cursor) {
        FeedbackResponseDTO.FeedbackListDTO data = feedbackService.getList(authenticatedUser, period, grade, sort, cursor);
        return ResponseEntity.ok(data);
    }
}
