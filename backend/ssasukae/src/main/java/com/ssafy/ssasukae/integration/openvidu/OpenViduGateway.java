package com.ssafy.ssasukae.integration.openvidu;

import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.room.RoomErrorCode;

import io.openvidu.java.client.*;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.Optional;

@Component
@RequiredArgsConstructor
public class OpenViduGateway implements MediaSessionGateway {

    private final OpenVidu openVidu;

    @Override
    public String createSession() {
        try {
            Session session = openVidu.createSession(new SessionProperties.Builder().build());
            return session.getSessionId();
        } catch (OpenViduJavaClientException | OpenViduHttpException e) {
            throw new CustomException(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED);
        }
    }

    @Override
    public String createConnectionToken(String sessionId, Long participantId) {
        try {
            Session session = findActiveSession(sessionId);

            ConnectionProperties properties = new ConnectionProperties.Builder()
                    .type(ConnectionType.WEBRTC)
                    .role(OpenViduRole.PUBLISHER)
                    .data("{\"participantId\":" + participantId + "}")
                    .build();

            Connection connection = session.createConnection(properties);
            return connection.getToken();
        } catch (OpenViduJavaClientException | OpenViduHttpException e) {
            throw new CustomException(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED);
        }
    }

    @Override
    public void disconnect(String sessionId, String connectionId) {
        // LOW_LATENCY 방 참가자는 OpenVidu 커넥션 없이 온라인 상태가 되므로 connectionId 가 없다.
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }

        try {
            Session session = findActiveSession(sessionId);
            session.forceDisconnect(connectionId);
        } catch (OpenViduJavaClientException | OpenViduHttpException e) {
            throw new CustomException(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED);
        }
    }

    @Override
    public void closeSession(String sessionId) {
        try {
            Optional<Session> session = findSession(sessionId);
            if (session.isEmpty()) {
                return;
            }
            session.get().close();
        } catch (OpenViduJavaClientException | OpenViduHttpException e) {
            throw new CustomException(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED);
        }
    }

    private Session findActiveSession(String sessionId)
            throws OpenViduJavaClientException, OpenViduHttpException {
        return findSession(sessionId)
                .orElseThrow(() -> new CustomException(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED));
    }

    private Optional<Session> findSession(String sessionId)
            throws OpenViduJavaClientException, OpenViduHttpException {
        openVidu.fetch();

        return openVidu.getActiveSessions().stream()
                .filter(session -> Objects.equals(session.getSessionId(), sessionId))
                .findFirst();
    }
}
