package com.ssafy.ssasukae.domain.performance.service;

import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceSnapShot;
import com.ssafy.ssasukae.domain.performance.redis.performance.PerformanceStore;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
@RequiredArgsConstructor
public class PerformanceTransactionSupport {

  private final PerformanceStore performanceStore;

  public void saveWithRollback(PerformanceSnapShot previous, PerformanceSnapShot changed) {
    // 일단 현재 상태를 저장
    performanceStore.save(changed);

    // 이 이후에 로직 실행하다가 만약 롤백해야할 경우에는 이전 상태를 다시 저장
    restoreOnRollback(() -> performanceStore.save(previous));
  }

  public void deletePerformance(PerformanceSnapShot snapShot) {
    try {
      performanceStore.delete(snapShot);
    } catch (RuntimeException exception) {
      log.error("공연 Redis 스냅샷 삭제에 실패했습니다. performanceId={}", snapShot.performanceId(), exception);
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
