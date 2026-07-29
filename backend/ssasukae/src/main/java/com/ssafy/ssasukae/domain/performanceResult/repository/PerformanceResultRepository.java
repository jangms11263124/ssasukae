package com.ssafy.ssasukae.domain.performanceResult.repository;

import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;
import com.ssafy.ssasukae.domain.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface PerformanceResultRepository extends JpaRepository<PerformanceResult, Long> {
    @Query("SELECT pr FROM PerformanceResult pr WHERE pr.user = :user ORDER BY pr.createdAt DESC LIMIT :N")
    List<PerformanceResult> findNRecentPerformances(User user, Integer N);
}
