package com.ssafy.ssasukae.domain.performance.rest.request;

import jakarta.validation.constraints.NotNull;

public record AiAnalysisSuccessRequest(
    @NotNull
        Integer pitchScore,
    @NotNull
        Integer rhythmScore,
    @NotNull
        Integer lyricsScore,
    @NotNull
        Integer stabilityScore,
    @NotNull
        Integer finalScore) {}
