package com.ssafy.ssasukae.domain.user.dto;

import com.ssafy.ssasukae.domain.favorite.dto.FavoriteResponseDTO;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.security.Timestamp;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MyPageResponse {
    Long userId;
    String nickname;
    String email;
    String profileImageUrl;
    Timestamp createdAt;
}