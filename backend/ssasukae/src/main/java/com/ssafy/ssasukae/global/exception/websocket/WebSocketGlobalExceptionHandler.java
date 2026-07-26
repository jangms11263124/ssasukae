package com.ssafy.ssasukae.global.exception.websocket;

import java.util.List;

import lombok.extern.slf4j.Slf4j;

import org.springframework.messaging.converter.MessageConversionException;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.support.MethodArgumentNotValidException;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.web.bind.annotation.ControllerAdvice;

@Slf4j
@ControllerAdvice
public class WebSocketGlobalExceptionHandler {

    private static final String ERROR_DESTINATION = "/queue/errors";

    /**
     * @MessageMapping 메서드 또는 그 아래 서비스 계층에서 발생한
     * 예상 가능한 WebSocket 비즈니스 예외를 개인 에러 큐로 전달한다.
     */
    @MessageExceptionHandler(WebSocketException.class)
    @SendToUser(destinations = ERROR_DESTINATION, broadcast = false)
    public WebSocketErrorResponse handleWebSocketException(
            WebSocketException exception
    ) {
        return WebSocketErrorResponse.from(exception);
    }

    /**
     * @Valid 검증 실패를 필드 단위 상세 정보와 함께 전달한다.
     */
    @MessageExceptionHandler(MethodArgumentNotValidException.class)
    @SendToUser(destinations = ERROR_DESTINATION, broadcast = false)
    public WebSocketErrorResponse handleValidationException(
            MethodArgumentNotValidException exception
    ) {
        assert exception.getBindingResult() != null;
        List<WebSocketFieldErrorDetail> details =
                exception.getBindingResult()
                        .getFieldErrors()
                        .stream()
                        .map(fieldError ->
                                new WebSocketFieldErrorDetail(
                                        fieldError.getField(),
                                        fieldError.getDefaultMessage()
                                )
                        )
                        .toList();

        return WebSocketErrorResponse.of(
                WebSocketErrorCode.INVALID_REQUEST,
                WebSocketErrorCode.INVALID_REQUEST.getDefaultMessage(),
                details
        );
    }

    /**
     * JSON 역직렬화 실패 등 요청 Payload 형식 오류를 처리한다.
     */
    @MessageExceptionHandler(MessageConversionException.class)
    @SendToUser(destinations = ERROR_DESTINATION, broadcast = false)
    public WebSocketErrorResponse handleMessageConversionException(
            MessageConversionException exception
    ) {
        return WebSocketErrorResponse.of(
                WebSocketErrorCode.INVALID_REQUEST,
                "요청 Payload 형식이 올바르지 않습니다."
        );
    }

    /**
     * 클라이언트에 내부 예외 정보를 노출하지 않고 공통 서버 오류로 응답한다.
     */
    @MessageExceptionHandler(Exception.class)
    @SendToUser(destinations = ERROR_DESTINATION, broadcast = false)
    public WebSocketErrorResponse handleUnexpectedException(
            Exception exception
    ) {
        log.error(
                "WebSocket 메시지 처리 중 예상하지 못한 오류가 발생했습니다.",
                exception
        );

        return WebSocketErrorResponse.of(
                WebSocketErrorCode.INTERNAL_SERVER_ERROR
        );
    }
}
