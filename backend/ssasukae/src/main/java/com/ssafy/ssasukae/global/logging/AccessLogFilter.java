package com.ssafy.ssasukae.global.logging;

import java.io.IOException;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Spring Security 필터 체인 안쪽(JwtAuthenticationFilter 이전)에 명시적으로 등록해서 써야 한다.
 * SecurityConfig에서 {@code @Bean}으로 선언하고
 * {@code http.addFilterBefore(accessLogFilter, JwtAuthenticationFilter.class)}로 연결할 것.
 * {@code @Component}로 두면 서블릿 컨테이너 레벨에서 별도로 자동 등록되어 로그가 중복 찍히고,
 * 필터 순서에 따라 finally 블록 실행 시점에 SecurityContext가 이미 비워져 userId가
 * 항상 anonymous로 찍힐 수 있다.
 */
public class AccessLogFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger("ACCESS_LOG");

    private static final String TRACE_ID_HEADER = "X-Trace-Id";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/actuator/");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String traceId = resolveTraceId(request);
        response.setHeader(TRACE_ID_HEADER, traceId);

        MDC.put(LogMdcKeys.TRACE_ID, traceId);

        long startTime = System.currentTimeMillis();

        try {
            filterChain.doFilter(request, response);
        } finally {
            String userId = getUserId();
            MDC.put(LogMdcKeys.USER_ID, userId);

            long durationMs = System.currentTimeMillis() - startTime;
            int status = response.getStatus();

            logByStatus(
                    status,
                    "http method={} path={} status={} durationMs={} userId={} errorCode={}",
                    sanitize(request.getMethod()),
                    sanitize(getFullPath(request)),
                    status,
                    durationMs,
                    userId,
                    resolveErrorCode(status)
            );

            MDC.clear();
        }
    }

    private void logByStatus(int status, String format, Object... args) {
        if (status >= 500) {
            log.error(format, args);
        } else if (status >= 400) {
            log.warn(format, args);
        } else {
            log.info(format, args);
        }
    }

    private String resolveTraceId(HttpServletRequest request) {
        String incoming = request.getHeader(TRACE_ID_HEADER);

        if (incoming != null && !incoming.isBlank()) {
            return sanitize(incoming);
        }

        return UUID.randomUUID().toString();
    }

    private String getUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated()) {
            return "anonymous";
        }

        Object principal = authentication.getPrincipal();

        if (principal instanceof AuthenticatedUser authenticatedUser) {
            return String.valueOf(authenticatedUser.userId());
        }

        return "anonymous";
    }

    private String resolveErrorCode(int status) {
        if (status < 400) {
            return "-";
        }

        String errorCode = MDC.get(LogMdcKeys.ERROR_CODE);
        return (errorCode == null || errorCode.isBlank()) ? "-" : errorCode;
    }

    private String getFullPath(HttpServletRequest request) {
        String queryString = request.getQueryString();

        if (queryString == null || queryString.isBlank()) {
            return request.getRequestURI();
        }

        return request.getRequestURI() + "?" + queryString;
    }

    private String sanitize(String value) {
        if (value == null) {
            return "";
        }

        return value.replaceAll("[\\r\\n]", "_");
    }
}
