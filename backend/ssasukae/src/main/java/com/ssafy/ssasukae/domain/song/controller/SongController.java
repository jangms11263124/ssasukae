package com.ssafy.ssasukae.domain.song.controller;

import com.ssafy.ssasukae.domain.song.dto.SongResponseDTO;
import com.ssafy.ssasukae.domain.song.service.SongService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/songs")
public class SongController {
    private final SongService songService;

    @GetMapping()
    public ResponseEntity<SongResponseDTO.searchDTO> search(
            @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
            @RequestParam(required = false, defaultValue = "") String query,
            @RequestParam(required = false, defaultValue = "ALL") String filter,
            @RequestParam(required = false) Long cursor,
            @RequestParam(required = false, defaultValue = "20") @Min(20) @Max(50)  Integer size) {
                SongResponseDTO.searchDTO data = songService.search(
                        authenticatedUser.userId(),
                        query,
                        filter,
                        cursor,
                        size
                );
                return ResponseEntity.ok(data);
    }
}
