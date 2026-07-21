package com.ssafy.ssasukae.domain.performance.controller;

import java.security.Principal;

import com.ssafy.ssasukae.domain.performance.dto.StartPerformanceRequest;
import com.ssafy.ssasukae.domain.performance.dto.UpdatePerformanceSettingsRequest;
import com.ssafy.ssasukae.domain.performance.service.PerformanceService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

import jakarta.validation.Valid;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

@Controller
public class PerformanceMessageController {

  private final PerformanceService performanceService;

  public PerformanceMessageController(PerformanceService performanceService) {
    this.performanceService = performanceService;
  }

  @MessageMapping("/rooms/{roomId}/performances/start")
  public void startPerformance(
      @DestinationVariable Long roomId,
      @Valid @Payload StartPerformanceRequest request,
      Principal principal) {
    performanceService.startPerformance(roomId, resolveUserId(principal), request);
  }

  @MessageMapping("/rooms/{roomId}/performances/{performanceId}/playback/start")
  public void startPlayback(
      @DestinationVariable Long roomId,
      @DestinationVariable Long performanceId,
      Principal principal) {
    performanceService.startPlayback(roomId, performanceId, resolveUserId(principal));
  }

  @MessageMapping("/rooms/{roomId}/performances/{performanceId}/playback/finish")
  public void finishPlayback(
      @DestinationVariable Long roomId,
      @DestinationVariable Long performanceId,
      Principal principal) {
    performanceService.finishPlayback(roomId, performanceId, resolveUserId(principal));
  }

  @MessageMapping("/rooms/{roomId}/performances/{performanceId}/cancel")
  public void cancelPerformance(
      @DestinationVariable Long roomId,
      @DestinationVariable Long performanceId,
      Principal principal) {
    performanceService.cancelPerformance(roomId, performanceId, resolveUserId(principal));
  }

  @MessageMapping("/rooms/{roomId}/performances/{performanceId}/settings")
  public void updatePerformanceSettings(
      @DestinationVariable Long roomId,
      @DestinationVariable Long performanceId,
      @Valid @Payload UpdatePerformanceSettingsRequest request,
      Principal principal) {
    performanceService.updatePerformanceSettings(
        roomId, performanceId, resolveUserId(principal), request);
  }

  private Long resolveUserId(Principal principal) {
    if (principal instanceof Authentication authentication
        && authentication.getPrincipal() instanceof AuthenticatedUser user) {
      return user.userId();
    }
    throw new AuthenticationCredentialsNotFoundException(
        "인증된 WebSocket 사용자 정보를 찾을 수 없습니다.");
  }
}
