package com.ssafy.ssasukae.integration.openvidu;

public interface MediaSessionGateway {

  String createSession();

  String createConnectionToken(String sessionId, Long participantId);
}
