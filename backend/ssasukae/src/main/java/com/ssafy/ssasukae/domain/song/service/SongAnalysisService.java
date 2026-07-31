package com.ssafy.ssasukae.domain.song.service;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.ssafy.ssasukae.integration.aws.S3AssetFolder;
import com.ssafy.ssasukae.integration.aws.S3StorageService;

import lombok.RequiredArgsConstructor;

/**
 * SongService와 별도 빈으로 둔다. SongService 안에서 self-invocation으로 호출하면
 * createBareSong/finalizeSongResources의 @Transactional이 프록시를 안 거쳐서 무시되기 때문.
 * S3 업로드 4개는 여기서 트랜잭션 없이 처리하고, DB 쓰기만 SongService의 짧은 트랜잭션에 위임한다.
 */
@Service
@RequiredArgsConstructor
public class SongAnalysisService {

    private final SongService songService;
    private final S3StorageService s3StorageService;

    public Long registerAnalyzedSong(
            String title,
            String artist,
            Integer duration,
            Integer difficultyLevel,
            MultipartFile albumImg,
            MultipartFile lyrics,
            MultipartFile midi,
            MultipartFile mr
    ) {
        Long songId = songService.createBareSong(title, artist);

        String thumbnailImageUrl = s3StorageService.publicUrl(
                s3StorageService.upload(albumImg, songId, S3AssetFolder.COVER_IMAGE));
        String lyricsObjectKey = s3StorageService.upload(lyrics, songId, S3AssetFolder.LYRICS);
        String midiObjectKey = s3StorageService.upload(midi, songId, S3AssetFolder.MIDI);
        String mrObjectKey = s3StorageService.upload(mr, songId, S3AssetFolder.MR);

        songService.finalizeSongResources(
                songId,
                duration,
                difficultyLevel,
                thumbnailImageUrl,
                mrObjectKey,
                midiObjectKey,
                lyricsObjectKey
        );

        return songId;
    }
}
