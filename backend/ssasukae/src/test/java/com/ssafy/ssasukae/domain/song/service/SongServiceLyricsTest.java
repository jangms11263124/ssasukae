package com.ssafy.ssasukae.domain.song.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ssafy.ssasukae.domain.favorite.repository.FavoriteRepository;
import com.ssafy.ssasukae.domain.song.dto.SongLyricsResponse;
import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.song.repository.SongRepository;
import com.ssafy.ssasukae.domain.user.repository.UserRepository;
import com.ssafy.ssasukae.global.exception.CustomException;
import com.ssafy.ssasukae.global.exception.song.SongErrorCode;
import com.ssafy.ssasukae.integration.aws.S3StorageService;

@ExtendWith(MockitoExtension.class)
class SongServiceLyricsTest {

  private static final Long SONG_ID = 1L;
  private static final String LYRICS_KEY = "songs/1/lyrics.txt";
  private static final String LYRICS_URL = "https://cdn.test/lyrics.txt";

  @Mock private SongRepository songRepository;
  @Mock private FavoriteRepository favoriteRepository;
  @Mock private UserRepository userRepository;
  @Mock private S3StorageService s3StorageService;

  private SongService songService;

  @BeforeEach
  void setUp() {
    songService =
        new SongService(songRepository, favoriteRepository, userRepository, s3StorageService);
  }

  @Test
  void returnsPresignedLyricsUrl() {
    Song song = Song.create("title", "artist", 180, 3, null, null, null, LYRICS_KEY);
    when(songRepository.findById(SONG_ID)).thenReturn(Optional.of(song));
    when(s3StorageService.presignedUrl(LYRICS_KEY)).thenReturn(LYRICS_URL);

    SongLyricsResponse response = songService.getLyrics(SONG_ID);

    assertThat(response.lyricsUrl()).isEqualTo(LYRICS_URL);
    verify(s3StorageService).presignedUrl(LYRICS_KEY);
  }

  @Test
  void rejectsMissingSong() {
    when(songRepository.findById(SONG_ID)).thenReturn(Optional.empty());

    assertSongError(SongErrorCode.SONG_NOT_FOUND);
    verifyNoInteractions(s3StorageService);
  }

  @Test
  void rejectsSongWithoutLyricsKey() {
    Song song = Song.create("title", "artist", 180, 3, null, null, null, null);
    when(songRepository.findById(SONG_ID)).thenReturn(Optional.of(song));

    assertSongError(SongErrorCode.LYRICS_NOT_FOUND);
    verifyNoInteractions(s3StorageService);
  }

  private void assertSongError(SongErrorCode errorCode) {
    assertThatThrownBy(() -> songService.getLyrics(SONG_ID))
        .isInstanceOfSatisfying(
            CustomException.class,
            exception -> assertThat(exception.getErrorCode()).isEqualTo(errorCode));
  }
}
