package com.ssafy.ssasukae.domain.favorite.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

public class FavoriteResponseDTO {

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class QueryDTO {
        int totalCount;
        List<SongItemDTO> songs;
        Long nextCursor;
    }

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class SongItemDTO {
        long songId;
        String title;
        String artist;
        String thumbnailUrl;
        LocalDateTime favoritedAt;
    }

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class SimpleFavoriteDTO {
        Integer count;
        List<SongItemDTO> items;
    }
}
