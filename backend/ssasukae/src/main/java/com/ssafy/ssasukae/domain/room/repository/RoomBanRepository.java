package com.ssafy.ssasukae.domain.room.repository;

import com.ssafy.ssasukae.domain.room.entity.RoomBan;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RoomBanRepository extends JpaRepository<RoomBan, Long> {

  boolean existsByRoom_IdAndUser_Id(Long roomId, Long userId);
}
