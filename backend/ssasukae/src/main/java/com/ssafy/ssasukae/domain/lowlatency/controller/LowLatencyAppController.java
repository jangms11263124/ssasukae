package com.ssafy.ssasukae.domain.lowlatency.controller;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ssafy.ssasukae.domain.lowlatency.dto.LowLatencyAppSessionResponse;
import com.ssafy.ssasukae.domain.lowlatency.service.LowLatencyAppService;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.lowlatency.LowLatencyErrorCode;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/rooms/{roomId}/low-latency")
public class LowLatencyAppController {

  private static final String BEARER_PREFIX = "Bearer ";

  private final LowLatencyAppService lowLatencyAppService;

  @PostMapping("/app-session")
  public ResponseEntity<LowLatencyAppSessionResponse> createAppSession(
      @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
      @PathVariable Long roomId,
      HttpServletRequest request) {
    LowLatencyAppSessionResponse response =
        lowLatencyAppService.createAppSession(
            authenticatedUser.userId(), roomId, resolveAccessToken(request));
    return ResponseEntity.ok(response);
  }

  private String resolveAccessToken(HttpServletRequest request) {
    String authorization = request.getHeader("Authorization");
    if (!StringUtils.hasText(authorization) || !authorization.startsWith(BEARER_PREFIX)) {
      throw new CustomException(LowLatencyErrorCode.APP_SESSION_AUTHENTICATION_REQUIRED);
    }
    return authorization.substring(BEARER_PREFIX.length());
  }
}
