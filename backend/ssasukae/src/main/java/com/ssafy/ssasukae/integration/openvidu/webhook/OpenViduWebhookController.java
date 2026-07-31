package com.ssafy.ssasukae.integration.openvidu.webhook;

import com.ssafy.ssasukae.integration.openvidu.webhook.dto.OpenViduWebhookRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/internal/openvidu")
@RequiredArgsConstructor
public class OpenViduWebhookController {

    private static final String WEBHOOK_SECRET_HEADER = "X-Openvidu-Webhook-Secret";

    private final OpenViduWebhookAuthenticator openViduWebhookAuthenticator;
    private final OpenViduWebhookService openViduWebhookService;

    @PostMapping("/webhook")
    public void handle(
            @RequestHeader(value = WEBHOOK_SECRET_HEADER, required = false) String webhookSecret,
            @RequestBody OpenViduWebhookRequest request
    ) {
        openViduWebhookAuthenticator.authenticate(webhookSecret);

        switch (request.event()) {
            case "participantJoined" -> openViduWebhookService.handleParticipantJoined(request);
            case "participantLeft" -> openViduWebhookService.handleParticipantLeft(request);
            case "sessionDestroyed" -> openViduWebhookService.handleSessionDestroyed(request);
            default -> {
            }
        }
    }
}
