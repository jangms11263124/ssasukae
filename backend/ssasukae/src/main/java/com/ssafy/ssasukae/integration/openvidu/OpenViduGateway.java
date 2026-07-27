package com.ssafy.ssasukae.integration.openvidu;

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
            throw new IllegalStateException("OpenVidu 세션 생성에 실패했습니다.", e);
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
            throw new IllegalStateException("OpenVidu 토큰 발급에 실패했습니다.", e);
        }
    }

    @Override
    public void closeSession(String sessionId) {
        try {
            Session session = findActiveSession(sessionId);
            session.close();
        } catch (OpenViduJavaClientException | OpenViduHttpException e) {
            throw new IllegalStateException("OpenVidu 세션 종료에 실패했습니다.", e);
        }
    }

    private Session findActiveSession(String sessionId)
            throws OpenViduJavaClientException, OpenViduHttpException {
        openVidu.fetch();

        return openVidu.getActiveSessions().stream()
                .filter(session -> Objects.equals(session.getSessionId(), sessionId))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("OpenVidu 세션을 찾을 수 없습니다. sessionId=" + sessionId));
    }
}
