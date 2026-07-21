package com.ssafy.ssasukae.domain.performance.event;

import com.ssafy.ssasukae.domain.performance.type.PerformanceSettingsChangeSource;

public record PerformanceSettingsChangedDomainEvent(
    Long roomId,
    long roomVersion,
    Long performanceId,
    Long changedByParticipantId,
    PerformanceSettingsChangeSource source,
    long settingsVersion,
    int keyOffset,
    int tempoPercent,
    int mrVolumePercent,
    int micVolumePercent,
    int echoLevel,
    int reverbLevel) {}
