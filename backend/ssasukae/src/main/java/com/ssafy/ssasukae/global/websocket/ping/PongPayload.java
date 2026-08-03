package com.ssafy.ssasukae.global.websocket.ping;

import java.time.OffsetDateTime;

public record PongPayload(OffsetDateTime clientSentAt, OffsetDateTime serverReceivedAt) {}
