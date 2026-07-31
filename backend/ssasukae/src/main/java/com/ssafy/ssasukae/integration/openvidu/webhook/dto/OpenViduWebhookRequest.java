package com.ssafy.ssasukae.integration.openvidu.webhook.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;
import lombok.Getter;

@JsonIgnoreProperties(ignoreUnknown = true)
public record OpenViduWebhookRequest(
        String event,
        Long timestamp,
        String sessionId,
        String connectionId,
        String location,
        String ip,
        String platform,
        String clientData,
        String serverData,
        Long startTime,
        Long duration,
        String reason
) {
}
