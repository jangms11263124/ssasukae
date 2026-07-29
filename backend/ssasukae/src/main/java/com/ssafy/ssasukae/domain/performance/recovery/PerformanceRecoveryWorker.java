package com.ssafy.ssasukae.domain.performance.recovery;

import java.time.Instant;

import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.ssafy.ssasukae.domain.performance.service.PerformanceRecoveryService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 마감 시간이 지난 공연을 주기적으로 조회하여 복구하는 백그라운드 워커.
 *
 * <p>Redis ZSet 등에 저장된 공연 복구 마감 시간을 기준으로 복구 대상을 조회하고,
 * 각 공연에 대해 복구 처리를 수행한다.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class PerformanceRecoveryWorker {

  private final PerformanceRecoveryDeadlineStore deadlineStore;
  private final PerformanceRecoveryProperties properties;
  private final PerformanceRecoveryService recoveryService;

  /**
   * 애플리케이션 종료가 시작되었는지 나타내는 플래그.
   * 스케줄러 스레드와 애플리케이션 종료 이벤트 처리 스레드에서 함께 접근할 수 있으므로
   * 변경 사항의 가시성을 보장하기 위해 {@code volatile}을 사용한다.
   */
  private volatile boolean running = true;

  /**
   * 설정된 간격마다 복구 마감 시간이 지난 공연을 조회하고 복구한다.
   * {@code fixedDelay}이므로 이전 작업이 종료된 시점부터 설정된 시간이 지난 후 다음 작업이 실행된다.
   */
  @Scheduled(fixedDelayString = "${performance.recovery.scan-delay:1s}")
  public void recoverExpiredPerformances() {
    // 애플리케이션 종료가 시작된 이후에는 새로운 복구 작업을 수행하지 않는다.
    if (!running) {
      return;
    }

    // 이번 조회와 복구 처리에서 동일한 기준 시각을 사용한다.
    Instant now = Instant.now();
    Iterable<Long> performanceIds;

    try {
      // 현재 시각까지 복구 마감 시간이 도래한 공연을 배치 크기만큼 조회한다.
      performanceIds = deadlineStore.findDuePerformanceIds(now, properties.getBatchSize());
    } catch (RuntimeException exception) {
      /*
       * 애플리케이션 종료 과정에서 Redis 연결 팩토리가 먼저 종료될 수 있다.
       * 정상적인 종료 과정에서 발생한 예외는 불필요한 오류 로그를 남기지 않는다.
       */
      if (running && !isRedisShutdown(exception)) {
        log.error("공연 복구 대상 조회에 실패했습니다.", exception);
      }
      return;
    }

    for (Long performanceId : performanceIds) {
      try {
        // 한 공연의 복구 실패가 같은 배치에 포함된 다른 공연의 복구를 막지 않도록 공연별로 예외를 처리한다.
        recoveryService.recoverExpired(performanceId, now);
      } catch (RuntimeException exception) {
        // 종료 중이 아니라면 개별 공연의 복구 실패를 기록한다.
        if (running) {
          log.error(
                  "공연 복구 처리에 실패했습니다. performanceId={}",
                  performanceId,
                  exception
          );
        }
      }
    }
  }

  /**
   * 애플리케이션 컨텍스트가 종료되기 시작하면 복구 워커를 중지 상태로 변경한다.
   * 종료 과정에서 스케줄러가 추가 Redis 요청을 보내거나 불필요한 오류 로그를 남기는 것을 방지한다.
   */
  @EventListener(ContextClosedEvent.class)
  public void stop() {
    running = false;
  }

  // 예외의 원인 체인을 순회하며 Redis 연결 팩토리 종료로 발생한 예외인지 확인한다.
  private boolean isRedisShutdown(Throwable throwable) {
    Throwable current = throwable;

    while (current != null) {
      if (current instanceof IllegalStateException
              && current.getMessage() != null
              && current.getMessage().contains(
              "LettuceConnectionFactory has been STOPPED"
      )) {
        return true;
      }

      // 예외가 여러 계층으로 감싸져 있을 수 있으므로 원인 예외까지 확인한다.
      current = current.getCause();
    }

    return false;
  }
}