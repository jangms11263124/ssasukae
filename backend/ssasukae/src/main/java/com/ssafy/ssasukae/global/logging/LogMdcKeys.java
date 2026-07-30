package com.ssafy.ssasukae.global.logging;

/**
 * AccessLogFilter와, MDC에 사유를 남기는 다른 컴포넌트(GlobalExceptionHandler,
 * JwtAuthenticationFilter 등)가 공유하는 MDC 키 모음.
 */
public final class LogMdcKeys {

    public static final String TRACE_ID = "traceId";
    public static final String USER_ID = "userId";
    public static final String ERROR_CODE = "errorCode";

    private LogMdcKeys() {
    }
}
