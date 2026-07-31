package com.ssafy.ssasukae.domain.admin.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ssafy.ssasukae.domain.admin.dto.AdminUploadTicketResponse;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import com.ssafy.ssasukae.integration.ai.AiUploadTicketProvider;

import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/songs")
public class AdminSongController {

    private final AiUploadTicketProvider aiUploadTicketProvider;

    /**
     * 관리자가 AI 서버에 곡 분석을 직접 요청하기 전에 들고 갈 단발성 티켓을 발급한다.
     * 이 엔드포인트 자체는 파일/DB를 건드리지 않고, ROLE_ADMIN 검증(SecurityConfig)만 통과하면
     * 그 사실을 증명하는 티켓 하나를 내려준다.
     */
    @PostMapping("/upload-ticket")
    public ResponseEntity<AdminUploadTicketResponse> issueUploadTicket(
            @AuthenticationPrincipal AuthenticatedUser authenticatedUser
    ) {
        String ticket = aiUploadTicketProvider.issueTicket(authenticatedUser.userId());
        return ResponseEntity.ok(new AdminUploadTicketResponse(ticket));
    }
}
