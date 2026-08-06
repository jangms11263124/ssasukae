package com.ssafy.ssasukae.domain.song.service;

import com.ssafy.ssasukae.domain.song.dto.SongLyricsResponse;
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
import org.springframework.util.StringUtils;

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

    public SongLyricsResponse getLyrics(Long songId) {
        Song song = songRepository.findById(songId)
                .orElseThrow(() -> new CustomException(SongErrorCode.SONG_NOT_FOUND));

        if (!StringUtils.hasText(song.getLyricsObjectKey())) {
            throw new CustomException(SongErrorCode.LYRICS_NOT_FOUND);
        }

        return new SongLyricsResponse(s3StorageService.presignedUrl(song.getLyricsObjectKey()));
    }

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
                                .thumbnailUrl(song.getThumbnailImageUrl())
                                .favorite(likes.contains(song.getId())).build())
                        .toList())
                .cursor(hasNext && !songs.isEmpty() ? songs.get(songs.size() - 1).getId() : null)
                .build();
    }

    /**
     * 제목/가수명만으로 곡을 우선 생성해 songId를 확보한다.
     * S3 업로드 키가 songId를 필요로 하기 때문에 자산 업로드보다 먼저 호출되어야 한다.
     */
    @Transactional
    public Long createBareSong(String title, String artist) {
        Song song = Song.create(title, artist);
        return songRepository.save(song).getId();
    }

    /**
     * S3 업로드가 모두 끝난 뒤, AI 분석 결과로 곡 정보를 완성한다.
     * S3 호출은 이 메서드 밖(호출자)에서 이미 끝낸 상태로 넘어와야 한다 — DB 커넥션을 느린 외부 I/O 동안 붙들지 않기 위함.
     */
    @Transactional
    public void finalizeSongResources(
            Long songId,
            Integer duration,
            Integer difficultyLevel,
            String thumbnailImageUrl,
            String mrObjectKey,
            String midiObjectKey,
            String lyricsObjectKey
    ) {
        Song song = songRepository.findById(songId)
                .orElseThrow(() -> new CustomException(SongErrorCode.SONG_NOT_FOUND));
        song.updateMetadata(song.getTitle(), song.getArtist(), duration, difficultyLevel);
        song.updateResources(thumbnailImageUrl, mrObjectKey, midiObjectKey, lyricsObjectKey);
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
