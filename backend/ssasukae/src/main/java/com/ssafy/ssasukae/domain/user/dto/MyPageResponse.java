package com.ssafy.ssasukae.domain.user.dto;

import com.ssafy.ssasukae.domain.favorite.dto.FavoriteResponseDTO;
import com.ssafy.ssasukae.domain.performance.dto.PerformanceResponseDTO;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.security.Timestamp;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MyPageResponse {
    Long userId;
    String nickname;
    String provider;
    String email;
    String profileImageUrl;
    FavoriteResponseDTO.SimpleFavoriteDTO favorites;
    List<PerformanceResponseDTO.RecentPerformanceDTO> recentPerformances;
    LocalDateTime createdAt;
}