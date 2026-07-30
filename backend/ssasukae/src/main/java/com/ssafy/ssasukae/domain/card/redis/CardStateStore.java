package com.ssafy.ssasukae.domain.card.redis;

import java.util.Optional;

// 카드 사용 관련 스냅샷 저장소 인터페이스
public interface CardStateStore {

  // 카드 할당 정보 저장
  void saveAssignment(CardAssignmentSnapshot assignment);
  // 카드 할당 정보 가져옴
  Optional<CardAssignmentSnapshot> findAssignment(
      Long roomId, Long performanceId, Long participantId);
  // 현재 방 카드 사용 상태 가져옴
  Optional<RoomCardSnapshot> findRoomCard(Long roomId);
  // 방 카드 사용 정보 저장
  void saveRoomCard(RoomCardSnapshot roomCard);
  // 방 카드 사용 정보 삭제
  void deleteRoomCard(Long roomId);
  // 공연 정보에서 카드 정보 삭제
  void deleteCardState(Long roomId, Long performanceId);
}
