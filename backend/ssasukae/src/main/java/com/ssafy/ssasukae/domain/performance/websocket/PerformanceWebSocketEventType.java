package com.ssafy.ssasukae.domain.performance.websocket;

import com.ssafy.ssasukae.global.websocket.message.WebSocketEventType;

public enum PerformanceWebSocketEventType implements WebSocketEventType {
    PERFORMANCE_STARTED,
    PERFORMANCE_PREPARATION_STARTED,
    PERFORMANCE_STATE_CHANGED,
    PLAYBACK_STARTED,
    PLAYBACK_FINISHED,
    PERFORMANCE_SETTINGS_CHANGED,
    PERFORMANCE_CANCELLED,
    LEADERBOARD_UPDATED;

    @Override
    public String value() {
        return name();
    }
}
