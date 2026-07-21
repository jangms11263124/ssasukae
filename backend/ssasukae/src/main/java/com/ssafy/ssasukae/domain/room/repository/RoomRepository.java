package com.ssafy.ssasukae.domain.room.repository;

import java.util.Optional;

import com.ssafy.ssasukae.domain.room.entity.Room;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RoomRepository extends JpaRepository<Room, Long> {

  boolean existsByInviteCode(String inviteCode);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select r from Room r where r.inviteCode = :inviteCode")
  Optional<Room> findByInviteCodeForUpdate(@Param("inviteCode") String inviteCode);
}
