package com.ssafy.ssasukae.domain.room.repository;

import com.ssafy.ssasukae.domain.room.entity.Room;
import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface RoomParticipantRepository extends JpaRepository<RoomParticipant, Long> {

    Optional<RoomParticipant> findFirstByRoomIdAndUserIdOrderByJoinedAtDescIdDesc(
            Long roomId,
            Long userId
    );

    /**
     * 동일 사용자가 연결 만료 후 같은 방에 새 참가자로 입장할 수 있으므로 가장 최근 참가 이력을 반환한다.
     * 기존 서비스 호출부의 의미를 유지하기 위한 호환 메서드다.
     */
    default Optional<RoomParticipant> findByRoomIdAndUserId(Long roomId, Long userId) {
        return findFirstByRoomIdAndUserIdOrderByJoinedAtDescIdDesc(roomId, userId);
    }

    boolean existsByRoomIdAndUserIdAndConnectionStatus(
            Long roomId,
            Long userId,
            ConnectionStatus connectionStatus
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select rp from RoomParticipant rp where rp.id = :participantId")
    Optional<RoomParticipant> findByIdForUpdate(@Param("participantId") Long participantId);

    @EntityGraph(attributePaths = "user")
    List<RoomParticipant> findAllByRoomIdAndConnectionStatusInOrderByJoinedAtAsc(
            Long roomId,
            Collection<ConnectionStatus> connectionStatuses
    );

    List<RoomParticipant> findAllByRoomIdAndConnectionStatusIn(
            Long roomId,
            Collection<ConnectionStatus> connectionStatuses
    );

    long countByRoomIdAndConnectionStatusIn(
            Long roomId,
            Collection<ConnectionStatus> connectionStatuses
    );

    boolean existsByRoomIdAndUserIdAndConnectionStatusIn(
            Long roomId,
            Long userId,
            Collection<ConnectionStatus> connectionStatuses
    );

    boolean existsByUserIdAndConnectionStatusIn(
            Long userId,
            Collection<ConnectionStatus> connectionStatuses
    );

    List<RoomParticipant> findRoomParticipantsByRoom(Room room);
}
