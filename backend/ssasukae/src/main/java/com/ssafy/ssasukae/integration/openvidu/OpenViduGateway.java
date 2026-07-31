package com.ssafy.ssasukae.integration.openvidu;

import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.room.RoomErrorCode;

import io.openvidu.java.client.*;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Component;

import java.util.Objects;

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
            Session session = findActiveSession(sessionId);
            session.close();
        } catch (OpenViduJavaClientException | OpenViduHttpException e) {
            throw new CustomException(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED);
        }
    }

    private Session findActiveSession(String sessionId)
            throws OpenViduJavaClientException, OpenViduHttpException {
        openVidu.fetch();

        return openVidu.getActiveSessions().stream()
                .filter(session -> Objects.equals(session.getSessionId(), sessionId))
                .findFirst()
                .orElseThrow(() -> new CustomException(RoomErrorCode.MEDIA_SESSION_OPERATION_FAILED));
    }
}
