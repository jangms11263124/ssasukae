package com.ssafy.ssasukae.domain.user.controller;

import com.ssafy.ssasukae.domain.user.dto.MyPageResponse;
import com.ssafy.ssasukae.domain.user.dto.NicknameCheckResponse;
import com.ssafy.ssasukae.domain.user.dto.PerformanceStatResponse;
import com.ssafy.ssasukae.domain.user.dto.UserResponse;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.service.UserService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

import lombok.RequiredArgsConstructor;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    @GetMapping("/me")
    public ResponseEntity<UserResponse> getCurrentUser(@AuthenticationPrincipal AuthenticatedUser authenticatedUser) {
        User user = userService.findById(authenticatedUser.userId());
        return ResponseEntity.ok(UserResponse.from(user));
    }

    @GetMapping("/me/mypage")
    public ResponseEntity<MyPageResponse> getMyPage(@AuthenticationPrincipal AuthenticatedUser authenticatedUser) {
        MyPageResponse data = userService.getMyPage(authenticatedUser);
        return ResponseEntity.ok(data);
    }

    @GetMapping("/nickname/check")
    public ResponseEntity<NicknameCheckResponse> checkNickname(@RequestParam String nickname) {
        boolean available = userService.isNicknameAvailable(nickname);
        return ResponseEntity.ok(new NicknameCheckResponse(available));
    }

    @GetMapping("/me/reperformance")
    public ResponseEntity<PerformanceStatResponse> refreshPerformanceStat(@AuthenticationPrincipal AuthenticatedUser authenticatedUser) {
        PerformanceStatResponse data = userService.refreshPerformanceStat(authenticatedUser);
        return ResponseEntity.ok(data);
    }
}
