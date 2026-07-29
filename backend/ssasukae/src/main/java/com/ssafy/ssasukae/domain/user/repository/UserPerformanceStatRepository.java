package com.ssafy.ssasukae.domain.user.repository;

import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.entity.UserPerformanceStat;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserPerformanceStatRepository extends JpaRepository<UserPerformanceStat, Long> {
    Optional<UserPerformanceStat> findByUser(User user);
}
