package com.ssafy.ssasukae.domain.performance.websocket;

import java.security.Principal;

import jakarta.validation.Valid;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

import com.ssafy.ssasukae.domain.performance.service.PerformanceService;
import com.ssafy.ssasukae.domain.performance.websocket.request.PerformancePrepareRequest;
import com.ssafy.ssasukae.domain.performance.websocket.request.PerformanceSettingsChangeRequest;
import com.ssafy.ssasukae.global.exception.websocket.WebSocketAuthenticationException;

@Controller
public class PerformanceWebSocketController {

    private final PerformanceService performanceService;

    public PerformanceWebSocketController(PerformanceService performanceService) {
        this.performanceService = performanceService;
    }

    // 공연 준비 시작 SEND
    @MessageMapping("/rooms/{roomId}/performance/prepare")
    public void prepare(
            @DestinationVariable Long roomId,
            @Valid @Payload PerformancePrepareRequest request,
            Principal principal) {
        performanceService.prepare(resolveUserId(principal), roomId, request);
    }

    // 음원 파일 세팅 후 음원 재생 SEND
    @MessageMapping("/rooms/{roomId}/performances/{performanceId}/playback/start")
    public void startPlayback(
            @DestinationVariable Long roomId,
            @DestinationVariable Long performanceId,
            Principal principal) {
        performanceService.startPlayback(resolveUserId(principal), roomId, performanceId);
    }

    // 음원 종료 SEND
    @MessageMapping("/rooms/{roomId}/performances/{performanceId}/playback/finish")
    public void finishPlayback(
            @DestinationVariable Long roomId,
            @DestinationVariable Long performanceId,
            Principal principal) {
        performanceService.finishPlayback(resolveUserId(principal), roomId, performanceId);
    }

    // 세팅 변경 SEND
    @MessageMapping("/rooms/{roomId}/performances/{performanceId}/settings")
    public void changeSettings(
            @DestinationVariable Long roomId,
            @DestinationVariable Long performanceId,
            @Valid @Payload PerformanceSettingsChangeRequest request,
            Principal principal) {
        performanceService.changeSettings(
                resolveUserId(principal), roomId, performanceId, request);
    }
    // 공연 도중 취소 SEND
    @MessageMapping("/rooms/{roomId}/performances/{performanceId}/cancel")
    public void cancel(
            @DestinationVariable Long roomId,
            @DestinationVariable Long performanceId,
            Principal principal) {
        performanceService.cancel(resolveUserId(principal), roomId, performanceId);
    }

    private Long resolveUserId(Principal principal) {
        if (principal == null) {
            throw WebSocketAuthenticationException.unauthorized();
        }

        try {
            return Long.valueOf(principal.getName());
        } catch (NumberFormatException exception) {
            throw WebSocketAuthenticationException.unauthorized();
        }
    }
}
