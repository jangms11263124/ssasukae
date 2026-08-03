package com.ssafy.ssasukae.domain.performance.service;

import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.ssafy.ssasukae.domain.performance.recovery.PerformanceRecoveryDeadlineStore;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
@RequiredArgsConstructor
public class PerformanceTransactionSupport {

  private final PerformanceStore performanceStore;
  private final PerformanceRecoveryDeadlineStore recoveryDeadlineStore;

  public void saveWithRollback(PerformanceSnapShot previous, PerformanceSnapShot changed) {
    if (!performanceStore.replace(previous, changed)) {
      throw new IllegalStateException("공연 상태가 다른 요청에 의해 먼저 변경되었습니다.");
    }

    // 롤백 보상도 방금 저장한 값이 그대로 남아 있을 때만 수행한다.
    restoreOnRollback(
        () -> {
          if (!performanceStore.replace(changed, previous)) {
            throw new IllegalStateException("롤백 중 공연 스냅샷이 이미 변경되었습니다.");
          }
        });
  }

  public void deletePerformance(PerformanceSnapShot snapShot) {
    try {
      performanceStore.delete(snapShot);
    } catch (RuntimeException exception) {
      log.error("공연 Redis 스냅샷 삭제에 실패했습니다. performanceId={}", snapShot.performanceId(), exception);
    }
  }

  // 공연 복구 정보 삭제
  public void deleteRecoveryDeadline(Long performanceId) {
    try {
      recoveryDeadlineStore.delete(performanceId);
    } catch (RuntimeException exception) {
      log.error("공연 복구 마감 정보 삭제에 실패했습니다. performanceId={}", performanceId, exception);
    }
  }

  public void afterCommit(Runnable action) {
    if (!TransactionSynchronizationManager.isSynchronizationActive()) {
      action.run();
      return;
    }

    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCommit() {
            action.run();
          }
        });
  }

  public void restoreOnRollback(Runnable action) {
    if (!TransactionSynchronizationManager.isSynchronizationActive()) {
      return;
    }

    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCompletion(int status) {
            if (status == TransactionSynchronization.STATUS_COMMITTED) {
              return;
            }

            try {
              action.run();
            } catch (RuntimeException exception) {
              log.error("공연 트랜잭션 보상 처리에 실패했습니다.", exception);
            }
          }
        });
  }
}
