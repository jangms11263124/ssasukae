package com.ssafy.ssasukae.global.security.jwt;

public record AuthenticatedUser(Long userId, String email, String role) {
}
