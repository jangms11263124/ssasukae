package com.ssafy.ssasukae.domain.performanceResult.repository;

import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;
import com.ssafy.ssasukae.domain.user.entity.User;
import org.springframework.cglib.core.Local;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;

public interface PerformanceResultRepository extends JpaRepository<PerformanceResult, Long> {
    @Query("SELECT pr FROM PerformanceResult pr WHERE pr.user = :user ORDER BY pr.createdAt DESC LIMIT :N")
    List<PerformanceResult> findNRecentPerformances(User user, Integer N);

    Long countByUser(User user);

    @Query("SELECT count(pr) FROM PerformanceResult pr " +
            "WHERE pr.user = :user " +
            "AND (:startedAt IS NULL OR pr.createdAt >= :startedAt) " +
            "AND pr.finalScore BETWEEN :min AND :max")
    Long countCriteria(User user, LocalDateTime startedAt, int min, int max);

    @Query("SELECT pr FROM PerformanceResult pr " +
            "WHERE pr.user = :user " +
            "AND (:startedAt IS NULL OR pr.createdAt >= :startedAt) " +
            "AND pr.finalScore BETWEEN :min AND :max " +
            "AND (:cursorId IS NULL " +
                "OR pr.createdAt < :cursorCreatedAt " +
                "OR (pr.createdAt = :cursorCreatedAt " +
                    "AND pr.id < :cursorId))" +
            "ORDER BY pr.createdAt DESC, pr.id DESC " +
            "LIMIT 11")
    List<PerformanceResult> findAllByCriteriaOrderByCreatedAt(User user, LocalDateTime startedAt, int min, int max, Long cursorId, LocalDateTime cursorCreatedAt);

    @Query("SELECT pr FROM PerformanceResult pr " +
            "WHERE pr.user = :user " +
            "AND (:startedAt IS NULL OR pr.createdAt >= :startedAt) " +
            "AND pr.finalScore BETWEEN :min AND :max " +
            "AND(:cursorId IS NULL " +
                "OR pr.finalScore < :cursorScore " +
                "OR (pr.finalScore = :cursorScore " +
                    "AND pr.id < :cursorId))" +
            "ORDER BY pr.finalScore DESC, pr.id DESC " +
            "LIMIT 11")
    List<PerformanceResult> findAllByCriteriaOrderByScore(User user, LocalDateTime startedAt, int min, int max, Long cursorId, Integer cursorScore);
}
