package com.ssafy.ssasukae.domain.performanceResult.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ssafy.ssasukae.domain.performanceResult.entity.PerformanceResult;

public interface PerformanceResultRepository extends JpaRepository<PerformanceResult, Long> {}
