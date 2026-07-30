package com.ssafy.ssasukae.domain.song.service;

import com.ssafy.ssasukae.domain.song.dto.SongResponseDTO;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import com.ssafy.ssasukae.domain.favorite.repository.FavoriteRepository;
import com.ssafy.ssasukae.domain.user.entity.User;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.song.SongErrorCode;
import com.ssafy.ssasukae.global.exception.user.UserErrorCode;
import com.ssafy.ssasukae.integration.aws.S3StorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SongService {
    private final SongRepository songRepository;
    private final FavoriteRepository favoriteRepository;
    private final UserRepository userRepository;
    private final S3StorageService s3StorageService;

    public SongResponseDTO.searchDTO search(Long userId, String query, String filter, Long cursor, Integer size) {
        User user = userRepository.findById(userId).orElseThrow(() -> new CustomException(UserErrorCode.USER_NOT_FOUND));
        String normalizedQuery = query.trim();
        String normalizedFilter = filter.trim().toUpperCase();

        List<Song> fetchedSongs = switch (normalizedFilter) {
            case "ALL" -> searchAll(normalizedQuery, cursor, size);
            case "RECOMMEND" -> searchRecommend(normalizedQuery, cursor, size);
            case "POPULAR" -> searchPopular(normalizedQuery, cursor, size);
            default -> throw new CustomException(SongErrorCode.UNSUPPORTED_SEARCH_FILTER);
        };

        boolean hasNext = fetchedSongs.size() > size;
        List<Song> songs = fetchedSongs.stream().limit(size).toList();
        Set<Long> likes = favoriteRepository.findSongIdByUser(user);

        return SongResponseDTO.searchDTO.builder()
                .items(songs.stream()
                        .map(song -> SongResponseDTO.ItemDTO.builder()
                                .songId(song.getId())
                                .title(song.getTitle())
                                .artist(song.getArtist())
                                .durationSeconds(song.getDuration())
                                .thumbnailUrl(s3StorageService.presignedUrl(song.getCoverObjectKey()))
                                .favorite(likes.contains(song.getId())).build())
                        .toList())
                .cursor(hasNext && !songs.isEmpty() ? songs.get(songs.size() - 1).getId() : null)
                .build();
    }

    private List<Song> searchAll(String query, Long cursor, int size) {
        return songRepository.searchAll(query, cursor, PageRequest.of(0, size + 1));
    }

    private List<Song> searchRecommend(String query, Long cursor, int size) {
        LocalDateTime cursorCreatedAt = null;

        if (cursor != null) cursorCreatedAt = songRepository.findById(cursor).orElseThrow(() -> new CustomException(SongErrorCode.SONG_NOT_FOUND)).getCreatedAt();

        return songRepository.searchRecommend(
                query,
                cursorCreatedAt,
                cursor,
                PageRequest.of(0, size + 1)
        );
    }

    private List<Song> searchPopular(String query, Long cursor, int size) {
        Long cursorFavoriteCount = null;

        if (cursor != null) {
            Song cursorSong = songRepository.findById(cursor).orElseThrow(() -> new CustomException(SongErrorCode.SONG_NOT_FOUND));
            cursorFavoriteCount = songRepository.countFavorites(cursorSong.getId());
        }

        return songRepository.searchPopular(
                query,
                cursorFavoriteCount,
                cursor,
                PageRequest.of(0, size + 1)
        );
    }
}
