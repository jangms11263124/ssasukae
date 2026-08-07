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

    /**
     * 사용자가 현재 참여 중인 방의 참가자를 찾는다.
     *
     * <p>STOMP 세션은 방 번호를 들고 있지 않아 userId 만으로 찾아야 한다.
     * 한 사용자는 한 방에만 활성으로 있을 수 있으므로(RoomService#validateNoActiveRoom)
     * 결과는 최대 하나지만, 만료 후 재입장 이력이 남을 수 있어 최신 것을 쓴다.
     */
    @EntityGraph(attributePaths = "room")
    Optional<RoomParticipant> findFirstByUserIdAndConnectionStatusInOrderByJoinedAtDescIdDesc(
            Long userId,
            Collection<ConnectionStatus> connectionStatuses
    );

    List<RoomParticipant> findRoomParticipantsByRoom(Room room);
}
