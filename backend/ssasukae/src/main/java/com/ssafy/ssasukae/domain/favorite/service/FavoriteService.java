package com.ssafy.ssasukae.domain.favorite.service;

import com.ssafy.ssasukae.domain.favorite.dto.FavoriteResponseDTO;
import com.ssafy.ssasukae.domain.favorite.entity.Favorite;
import com.ssafy.ssasukae.domain.favorite.repository.FavoriteRepository;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.favorite.FavoriteErrorCode;
import com.ssafy.ssasukae.global.exception.song.SongErrorCode;
import com.ssafy.ssasukae.global.exception.user.UserErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional
public class FavoriteService {
    private final FavoriteRepository favoriteRepository;
    private final UserRepository userRepository;
    private final SongRepository songRepository;

    public void favorite(long userId, long songId) {
        Optional<Favorite> like = favoriteRepository.findByUserAndSong(userId, songId);
        if(like.isPresent()) return;
        else {
            Favorite favorite = Favorite.builder()
                    .user(userRepository.findById(userId).orElseThrow(() -> new CustomException(UserErrorCode.USER_NOT_FOUND)))
                    .song(songRepository.findById(songId).orElseThrow(() -> new CustomException(SongErrorCode.SONG_NOT_FOUND)))
                    .createdAt(LocalDateTime.now()).build();
            favoriteRepository.save(favorite);
        }
    }

    public void unfavorite(long userId, long songId) {
        Optional<Favorite> like = favoriteRepository.findByUserAndSong(userId, songId);
        like.ifPresent(favoriteRepository::delete);
    }

    public FavoriteResponseDTO.QueryDTO query(long userId, String query, Long cursor, Integer size) {
        LocalDateTime cursorCreatedAt = null;
        Long cursorId = null;

        if (cursor != null) {
            Favorite cursorFavorite = favoriteRepository.findById(cursor)
                    .orElseThrow(() -> new CustomException(FavoriteErrorCode.FAVORITE_NOT_FOUND));

            cursorCreatedAt = cursorFavorite.getCreatedAt();
            cursorId = cursorFavorite.getFavoriteId();
        }

        User user = userRepository.findById(userId).orElseThrow(() -> new CustomException(UserErrorCode.USER_NOT_FOUND));
        List<Favorite> fetchData = favoriteRepository.search(user, query.trim(), cursorCreatedAt, cursorId, PageRequest.of(0, size + 1));
        boolean hasNext = fetchData.size() > size;
        List<Favorite> result = fetchData.stream().limit(size).toList();

        return FavoriteResponseDTO.QueryDTO.builder()
                .totalCount(favoriteRepository.countByUserAndQuery(user, query.trim()))
                .songs(result.stream()
                        .map((e) -> {
                            Song song = e.getSong();

                            return FavoriteResponseDTO.SongItemDTO.builder()
                                    .songId(song.getId())
                                    .title(song.getTitle())
                                    .artist(song.getArtist())
                                    .thumbnailUrl(null)
                                    .favoritedAt(e.getCreatedAt())
                                    .build();
                        }).toList())
                .nextCursor(hasNext && !result.isEmpty() ? result.get(result.size() - 1).getFavoriteId() : null)
                .build();
    }
}
