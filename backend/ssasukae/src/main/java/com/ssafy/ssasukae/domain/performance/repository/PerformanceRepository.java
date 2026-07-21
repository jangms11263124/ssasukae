package com.ssafy.ssasukae.domain.performance.repository;

import java.util.Collection;
import java.util.Optional;

import com.ssafy.ssasukae.domain.performance.entity.Performance;
import com.ssafy.ssasukae.domain.performance.type.PerformanceStatus;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PerformanceRepository extends JpaRepository<Performance, Long> {

  boolean existsByRoom_IdAndStatusIn(
      Long roomId, Collection<PerformanceStatus> statuses);

  Optional<Performance> findByIdAndRoom_Id(Long performanceId, Long roomId);

  @Query("select coalesce(max(p.roundNo), 0) from Performance p where p.room.id = :roomId")
  int findMaxRoundNoByRoomId(@Param("roomId") Long roomId);
}
