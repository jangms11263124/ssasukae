package com.ssafy.ssasukae.domain.room.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import com.ssafy.ssasukae.domain.room.entity.RoomParticipant;
import com.ssafy.ssasukae.domain.room.type.ConnectionStatus;
import com.ssafy.ssasukae.domain.room.type.ParticipantRole;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoomParticipantRepository extends JpaRepository<RoomParticipant, Long> {

  Optional<RoomParticipant> findByRoom_IdAndUser_Id(Long roomId, Long userId);

  Optional<RoomParticipant> findByIdAndRoom_Id(Long participantId, Long roomId);

  @EntityGraph(attributePaths = "user")
  List<RoomParticipant> findAllByRoom_IdOrderByJoinedAtAsc(Long roomId);

  Optional<RoomParticipant>
      findFirstByRoom_IdAndConnectionStatusOrderByUser_IdAsc(
          Long roomId, ConnectionStatus connectionStatus);

  long countByRoom_IdAndConnectionStatusIn(
      Long roomId, Collection<ConnectionStatus> statuses);

  boolean existsByUser_IdAndConnectionStatusIn(
      Long userId, Collection<ConnectionStatus> statuses);

  Optional<RoomParticipant> findByRoom_IdAndRole(Long roomId, ParticipantRole role);
}
