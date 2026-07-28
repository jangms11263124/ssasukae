package com.ssafy.ssasukae.domain.performance.redis;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Objects;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

/**
 * Redis에 저장되는 현재 공연 세션의 스냅샷이다.
 *
 * @param performanceId Redis에서 발급한 공연 식별자
 * @param roomId 공연이 진행되는 방 식별자
 * @param performerParticipantId 방 참가자 식별자
 * @param performerUserId 공연자 사용자 식별자
 * @param songId 공연 곡 식별자
 * @param status 현재 공연 상태
 * @param settings 현재 공연 설정
 * @param preparedAt 공연 준비 세션 생성 시각
 * @param startedAt 실제 음원 재생 시작 시각
 * @param playbackFinishedAt 실제 음원 재생 정상 종료 시각
 */
public record PerformanceSnapShot(
        Long performanceId,
        Long roomId,
        Long performerParticipantId,
        Long performerUserId,
        Long songId,
        com.ssafy.ssasukae.domain.performance.type.PerformanceStatus status,
        PerformanceSettings settings,
        OffsetDateTime preparedAt,
        OffsetDateTime startedAt,
        OffsetDateTime playbackFinishedAt) {

    /**
     * Redis 역직렬화와 상태 전이로 생성되는 모든 세션이 최소 불변식을 만족하는지 검증한다.
     * 상태별 시간 필드 규칙까지 검사하여 잘못 조합된 세션이 Redis에 저장되는 것을 막는다.
     */
    public PerformanceSnapShot {
        requirePositive(performanceId, "performanceId");
        requirePositive(roomId, "roomId");
        requirePositive(performerParticipantId, "performerParticipantId");
        requirePositive(performerUserId, "performerUserId");
        requirePositive(songId, "songId");
        Objects.requireNonNull(status, "status는 필수입니다.");
        Objects.requireNonNull(settings, "settings는 필수입니다.");
        Objects.requireNonNull(preparedAt, "preparedAt은 필수입니다.");

        validateTimeline(status, preparedAt, startedAt, playbackFinishedAt);
    }

    /** 새로운 공연을 PREPARING 상태와 기본 설정으로 생성한다. */
    public static PerformanceSnapShot prepare(
            Long performanceId,
            Long roomId,
            Long performerParticipantId,
            Long performerUserId,
            Long songId,
            OffsetDateTime preparedAt) {
        return new PerformanceSnapShot(
                performanceId,
                roomId,
                performerParticipantId,
                performerUserId,
                songId,
                PerformanceStatus.PREPARING,
                PerformanceSettings.defaults(),
                preparedAt,
                null,
                null);
    }

    /**
     * 실제 MR 재생을 시작한다.
     * PREPARING 상태에서만 PLAYING으로 전이할 수 있다.
     */
    public PerformanceSnapShot startPlayback(OffsetDateTime startedAt) {
        requireStatus(
                "공연 준비 상태에서만 재생을 시작할 수 있습니다.",
                PerformanceStatus.PREPARING);
        requireTimeNotBefore(startedAt, preparedAt, "startedAt", "preparedAt");

        return copy(
                PerformanceStatus.PLAYING,
                settings,
                startedAt,
                null);
    }

    /**
     * 실제 MR 재생의 정상 종료를 처리하고 AI 분석 대기 상태로 전환한다.
     * PLAYING 상태에서만 ANALYZING으로 전이할 수 있다.
     */
    public PerformanceSnapShot finishPlayback(OffsetDateTime finishedAt) {
        requireStatus(
                "재생 중인 공연만 정상 종료할 수 있습니다.",
                PerformanceStatus.PLAYING);
        requireTimeNotBefore(finishedAt, startedAt, "finishedAt", "startedAt");

        return copy(
                PerformanceStatus.ANALYZING,
                settings,
                startedAt,
                finishedAt);
    }

    /**
     * 공연 설정을 변경한다.
     * 공연 준비 또는 실제 재생 중에만 변경할 수 있다. 동일한 설정이 전달되면 현재 객체를 그대로 반환하여 불필요한 Redis 저장과 이벤트 발행을 피할 수 있게 한다.
     */
    public PerformanceSnapShot changeSettings(PerformanceSettings changedSettings) {
        requireStatus(
                "공연 준비 또는 재생 중에만 설정을 변경할 수 있습니다.",
                PerformanceStatus.PREPARING,
                PerformanceStatus.PLAYING);
        Objects.requireNonNull(changedSettings, "changedSettings는 필수입니다.");

        if (settings.equals(changedSettings)) {
            return this;
        }

        return copy(
                status,
                changedSettings,
                startedAt,
                playbackFinishedAt);
    }

    /**
     * 공연을 취소한다.
     * PREPARING, PLAYING 상태에서만 취소할 수 있으며, 취소 이벤트 발행 후 Redis 세션은 삭제 대상이 된다.
     */
    public PerformanceSnapShot cancel() {
        requireStatus(
                "준비 및 재생 중인 공연만 취소할 수 있습니다.",
                PerformanceStatus.PREPARING,
                PerformanceStatus.PLAYING);

        return copy(
                PerformanceStatus.CANCELLED,
                settings,
                startedAt,
                null);
    }

    /** AI 분석과 공연 결과 저장이 정상 완료된 공연을 FINISHED 상태로 전환한다. */
    public PerformanceSnapShot completeAnalysis() {
        requireStatus(
                "분석 중인 공연만 정상 완료할 수 있습니다.",
                PerformanceStatus.ANALYZING);

        return copy(
                PerformanceStatus.FINISHED,
                settings,
                startedAt,
                playbackFinishedAt);
    }

    /** AI 분석이 최종 실패한 공연을 ANALYSIS_FAILED 상태로 전환한다. */
    public PerformanceSnapShot failAnalysis() {
        requireStatus(
                "분석 중인 공연만 분석 실패로 처리할 수 있습니다.",
                PerformanceStatus.ANALYZING);

        return copy(
                PerformanceStatus.ANALYSIS_FAILED,
                settings,
                startedAt,
                playbackFinishedAt);
    }

    /** 요청 경로의 roomId와 Redis 세션의 roomId가 같은지 확인한다. */
    public boolean belongsToRoom(Long requestedRoomId) {
        return roomId.equals(requestedRoomId);
    }

    /** 요청 참가자가 이 공연의 가창자인지 확인한다. */
    public boolean isPerformedBy(Long participantId) {
        return performerParticipantId.equals(participantId);
    }

    /**
     * 더 이상 일반적인 공연 명령을 받을 수 없는 최종 상태인지 확인한다.
     */
    @JsonIgnore
    public boolean isTerminal() {
        return status == PerformanceStatus.FINISHED
                || status == PerformanceStatus.CANCELLED
                || status == PerformanceStatus.ANALYSIS_FAILED;
    }

    /**
     * record의 불변성을 유지하면서 일부 값만 변경한 새 세션을 생성한다.
     * 식별자와 준비 시각처럼 상태 전이 중 바뀌지 않는 값은 현재 객체에서 그대로 복사한다.
     */
    private PerformanceSnapShot copy(
            PerformanceStatus changedStatus,
            PerformanceSettings changedSettings,
            OffsetDateTime changedStartedAt,
            OffsetDateTime changedFinishedAt) {
        return new PerformanceSnapShot(
                performanceId,
                roomId,
                performerParticipantId,
                performerUserId,
                songId,
                changedStatus,
                changedSettings,
                preparedAt,
                changedStartedAt,
                changedFinishedAt);
    }

    /** 현재 상태가 요청에 허용된 상태가 아니면 WebSocket 비즈니스 오류로 변환한다. */
    private void requireStatus(
            String message,
            PerformanceStatus... allowedStatuses
    ) {
        boolean allowed = Arrays.stream(allowedStatuses)
                .anyMatch(allowedStatus -> status == allowedStatus);

        if (!allowed) {
            throw new IllegalStateException(
                    message
                            + " currentStatus=" + status
                            + ", allowedStatuses="
                            + Arrays.toString(allowedStatuses)
            );
        }
    }

    /** 상태와 시간 필드 조합이 일관적인지 검증한다. */
    private static void validateTimeline(
            PerformanceStatus status,
            OffsetDateTime preparedAt,
            OffsetDateTime startedAt,
            OffsetDateTime playbackFinishedAt) {
        switch (status) {
            case PREPARING -> {
                requireNull(startedAt, "PREPARING 상태에서는 startedAt이 없어야 합니다.");
                requireNull(
                        playbackFinishedAt,
                        "PREPARING 상태에서는 playbackFinishedAt이 없어야 합니다.");
            }
            case PLAYING -> {
                Objects.requireNonNull(startedAt, "PLAYING 상태에서는 startedAt이 필수입니다.");
                requireNull(
                        playbackFinishedAt,
                        "PLAYING 상태에서는 playbackFinishedAt이 없어야 합니다.");
                requireTimeNotBefore(startedAt, preparedAt, "startedAt", "preparedAt");
            }
            case ANALYZING, FINISHED, ANALYSIS_FAILED -> {
                Objects.requireNonNull(startedAt, status + " 상태에서는 startedAt이 필수입니다.");
                Objects.requireNonNull(
                        playbackFinishedAt,
                        status + " 상태에서는 playbackFinishedAt이 필수입니다.");
                requireTimeNotBefore(startedAt, preparedAt, "startedAt", "preparedAt");
                requireTimeNotBefore(
                        playbackFinishedAt,
                        startedAt,
                        "playbackFinishedAt",
                        "startedAt");
            }
            case CANCELLED -> {
                requireNull(
                        playbackFinishedAt,
                        "CANCELLED 상태에서는 playbackFinishedAt이 없어야 합니다.");
                if (startedAt != null) {
                    requireTimeNotBefore(startedAt, preparedAt, "startedAt", "preparedAt");
                }
            }
        }
    }

    private static void requirePositive(Long value, String fieldName) {
        if (value == null || value <= 0) {
            throw new IllegalArgumentException(fieldName + "는 양의 정수여야 합니다.");
        }
    }

    private static void requireNull(Object value, String message) {
        if (value != null) {
            throw new IllegalArgumentException(message);
        }
    }

    private static void requireTimeNotBefore(
            OffsetDateTime value,
            OffsetDateTime baseline,
            String fieldName,
            String baselineFieldName) {
        Objects.requireNonNull(value, fieldName + "은 필수입니다.");
        Objects.requireNonNull(baseline, baselineFieldName + "은 필수입니다.");

        if (value.isBefore(baseline)) {
            throw new IllegalArgumentException(
                    fieldName + "은 " + baselineFieldName + "보다 이전일 수 없습니다.");
        }
    }
}
