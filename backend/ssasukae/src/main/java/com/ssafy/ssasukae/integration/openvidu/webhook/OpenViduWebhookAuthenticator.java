package com.ssafy.ssasukae.integration.openvidu.webhook;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Component
public class OpenViduWebhookAuthenticator {

    private final byte[] expectedSecret;

    public OpenViduWebhookAuthenticator(
            @Value("${openvidu.webhook}") String webhookSecret
    ) {
        if (!StringUtils.hasText(webhookSecret)) {
            throw new IllegalStateException("OpenVidu webhook secret must be configured");
        }

        this.expectedSecret = webhookSecret.getBytes(StandardCharsets.UTF_8);
    }

    public void authenticate(String actualSecret) {
        if (!StringUtils.hasText(actualSecret)
                || !MessageDigest.isEqual(
                        expectedSecret,
                        actualSecret.getBytes(StandardCharsets.UTF_8)
                )) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Invalid OpenVidu webhook credentials"
            );
        }
    }
}
