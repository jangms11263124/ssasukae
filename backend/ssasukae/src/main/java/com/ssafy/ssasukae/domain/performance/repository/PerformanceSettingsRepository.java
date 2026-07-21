package com.ssafy.ssasukae.domain.performance.repository;

import java.util.Optional;

import com.ssafy.ssasukae.domain.performance.entity.PerformanceSettings;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PerformanceSettingsRepository
    extends JpaRepository<PerformanceSettings, Long> {

  Optional<PerformanceSettings> findByPerformance_Id(Long performanceId);
}
