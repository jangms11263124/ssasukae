package com.ssafy.ssasukae.global.security.jwt;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;

import com.ssafy.ssasukae.global.logging.LogMdcKeys;

import org.slf4j.MDC;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String AUTHORIZATION_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtTokenProvider jwtTokenProvider;
    private final TokenBlacklistService tokenBlacklistService;
    private final ActiveSessionService activeSessionService;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        String token = resolveToken(request);

        if (token == null) {
            MDC.put(LogMdcKeys.ERROR_CODE, "NO_TOKEN");
        } else if (!jwtTokenProvider.validateToken(token)) {
            MDC.put(LogMdcKeys.ERROR_CODE, "INVALID_TOKEN");
        } else if (tokenBlacklistService.isBlacklisted(jwtTokenProvider.getJti(token))) {
            MDC.put(LogMdcKeys.ERROR_CODE, "TOKEN_BLACKLISTED");
        } else if (!activeSessionService.isActiveSession(jwtTokenProvider.getUserId(token), jwtTokenProvider.getSid(token))) {
            MDC.put(LogMdcKeys.ERROR_CODE, "SESSION_INACTIVE");
        } else {
            AuthenticatedUser authenticatedUser = new AuthenticatedUser(
                    jwtTokenProvider.getUserId(token),
                    jwtTokenProvider.getEmail(token),
                    jwtTokenProvider.getRole(token)
            );

            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            authenticatedUser,
                            null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + authenticatedUser.role()))
                    );

            SecurityContextHolder.getContext().setAuthentication(authentication);
        }

        filterChain.doFilter(request, response);
    }

    private String resolveToken(HttpServletRequest request) {
        String bearerToken = request.getHeader(AUTHORIZATION_HEADER);

        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith(BEARER_PREFIX)) {
            return bearerToken.substring(BEARER_PREFIX.length());
        }

        return null;
    }
}
