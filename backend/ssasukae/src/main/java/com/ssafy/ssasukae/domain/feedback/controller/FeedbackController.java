package com.ssafy.ssasukae.domain.feedback.controller;

import com.ssafy.ssasukae.domain.feedback.dto.FeedbackResponseDTO;
import com.ssafy.ssasukae.domain.feedback.service.FeedbackService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}
