package com.ssafy.ssasukae.domain.room.repository;

import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.type.RoomMode;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface RoomRepository extends JpaRepository<Room, Long> {

    Optional<Room> findByInviteCode(String inviteCode);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Room r where r.inviteCode = :inviteCode")
    Optional<Room> findByInviteCodeForUpdate(@Param("inviteCode") String inviteCode);

    boolean existsByInviteCode(String inviteCode);

    // 동시에 방에 입장해서 최대 정원을 넘어버리는 상황 방지
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Room r where r.id = :roomId")
    Optional<Room> findByIdForUpdate(@Param("roomId") Long roomId);

    /**
     * 방 모드만 잠금 없이 읽는다.
     *
     * <p>모드에 따라 관여 여부가 갈리는 처리에서, 관여하지 않을 방까지
     * {@link #findByIdForUpdate}로 쓰기 잠금을 걸지 않기 위한 값싼 선검사용이다.
     */
    @Query("select r.mode from Room r where r.id = :roomId")
    Optional<RoomMode> findModeById(@Param("roomId") Long roomId);

    @Query("SELECT r FROM Room r WHERE r.openViduSessionId = :s")
    Optional<Room> findByOpenViduSessionId(String s);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM Room r WHERE r.openViduSessionId = :sessionId")
    Optional<Room> findByOpenViduSessionIdForUpdate(@Param("sessionId") String sessionId);
}
