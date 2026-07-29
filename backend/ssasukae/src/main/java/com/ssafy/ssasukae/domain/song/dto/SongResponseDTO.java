package com.ssafy.ssasukae.domain.song.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;

import java.util.List;

public class SongResponseDTO {

    @Data
    @RequiredArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class searchDTO {
        List<ItemDTO> items;
        Long cursor;
    }

    @Data
    @RequiredArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ItemDTO {
        Long songId;
        String title;
        String artist;
        Integer durationSeconds;
        String thumbnailUrl;
        boolean favorite;
    }
}
