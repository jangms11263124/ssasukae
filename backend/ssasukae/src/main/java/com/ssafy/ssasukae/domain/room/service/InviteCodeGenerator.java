package com.ssafy.ssasukae.domain.room.service;

import java.security.SecureRandom;

import com.ssafy.ssasukae.domain.room.repository.RoomRepository;

import org.springframework.stereotype.Component;

@Component
public class InviteCodeGenerator {

  private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  private static final int CODE_LENGTH = 6;
  private static final int MAX_ATTEMPTS = 20;

  private final RoomRepository roomRepository;
  private final SecureRandom secureRandom = new SecureRandom();

  public InviteCodeGenerator(RoomRepository roomRepository) {
    this.roomRepository = roomRepository;
  }

  public String generate() {
    for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      StringBuilder code = new StringBuilder(CODE_LENGTH);
      for (int index = 0; index < CODE_LENGTH; index++) {
        code.append(ALPHABET.charAt(secureRandom.nextInt(ALPHABET.length())));
      }

      String generated = code.toString();
      if (!roomRepository.existsByInviteCode(generated)) {
        return generated;
      }
    }

    throw new IllegalStateException("고유한 초대 코드를 생성하지 못했습니다.");
  }
}
