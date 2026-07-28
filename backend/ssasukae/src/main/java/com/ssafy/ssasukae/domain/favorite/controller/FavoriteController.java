package com.ssafy.ssasukae.domain.favorite.controller;

import com.ssafy.ssasukae.domain.favorite.dto.FavoriteResponseDTO;
import com.ssafy.ssasukae.domain.favorite.service.FavoriteService;
import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/users/me/favorites")
public class FavoriteController {
    private final FavoriteService favoriteService;

    @PostMapping("/{songId}")
    public ResponseEntity favor(@AuthenticationPrincipal AuthenticatedUser authenticatedUser, @PathVariable Long songId) {
        favoriteService.favorite(authenticatedUser.userId(), songId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{songId}")
    public ResponseEntity unfavor(@AuthenticationPrincipal AuthenticatedUser authenticatedUser, @PathVariable Long songId) {
        favoriteService.unfavorite(authenticatedUser.userId(), songId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping()
    public ResponseEntity<FavoriteResponseDTO.QueryDTO> getList(
            @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
            @RequestParam(required = false, defaultValue = "") String query,
            @RequestParam(required = false) Long cursor,
            @RequestParam(required = false, defaultValue = "20") @Min(20) @Max(50) Integer size) {
        FavoriteResponseDTO.QueryDTO data = favoriteService.query(authenticatedUser.userId(), query, cursor, size);
        return ResponseEntity.ok(data);
    }
}