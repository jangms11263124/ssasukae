package com.ssafy.ssasukae.domain.performance.recovery;

import java.time.Instant;
import java.util.List;

public interface PerformanceRecoveryDeadlineStore {

  void save(Long performanceId, Instant deadline);

  void delete(Long performanceId);

  List<Long> findDuePerformanceIds(Instant now, int limit);
}
