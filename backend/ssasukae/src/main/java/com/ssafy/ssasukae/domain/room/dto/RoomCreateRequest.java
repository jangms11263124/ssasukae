package com.ssafy.ssasukae.domain.room.dto;

import com.ssafy.ssasukae.domain.room.type.RoomMode;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RoomCreateRequest(

        @NotBlank
        @Size(max = 20)
        String name,

        @NotNull
        RoomMode mode
) {
}
