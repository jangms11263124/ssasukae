package com.ssafy.ssasukae.domain.song.entity;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "songs")
@EntityListeners(AuditingEntityListener.class)
@Getter
public class Song {

  protected Song() {}

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "song_id")
  private Long id;

  /**
   * 노래 제목
   */
  @Column(name = "title", nullable = false, length = 255)
  private String title;

  /**
   * 가수명
   */
  @Column(name = "artist", nullable = false, length = 255)
  private String artist;

  /**
   * 노래 재생 시간.
   *
   * 단위는 프로젝트에서 초 단위로 통일하는 것을 권장한다.
   */
  @Column(name = "duration")
  private Integer duration;

  /**
   * 노래 난이도.
   *
   * 예: 1~5
   */
  @Column(name = "difficulty_level")
  private Integer difficultyLevel;

  /**
   * S3에 저장된 앨범 커버 이미지의 Object Key
   */
  @Column(name = "cover_object_key", length = 2048)
  private String coverObjectKey;

  /**
   * S3에 저장된 MR 음원 파일의 Object Key
   */
  @Column(name = "mr_object_key", length = 512)
  private String mrObjectKey;

  /**
   * S3에 저장된 MIDI 또는 기준 음정 데이터 파일의 Object Key
   */
  @Column(name = "midi_object_key", length = 512)
  private String midiObjectKey;

  /**
   * S3에 저장된 가사 파일의 Object Key
   */
  @Column(name = "lyrics_object_key", length = 512)
  private String lyricsObjectKey;

  /**
   * 노래 데이터 생성 일시
   */
  @CreatedDate
  @Column(
          name = "created_at",
          nullable = false,
          updatable = false,
          columnDefinition = "TIMESTAMP(6)"
  )
  private LocalDateTime createdAt;

  private Song(
          String title,
          String artist,
          Integer duration,
          Integer difficultyLevel,
          String coverObjectKey,
          String mrObjectKey,
          String midiObjectKey,
          String lyricsObjectKey
  ) {
    this.title = title;
    this.artist = artist;
    this.duration = duration;
    this.difficultyLevel = difficultyLevel;
    this.coverObjectKey = coverObjectKey;
    this.mrObjectKey = mrObjectKey;
    this.midiObjectKey = midiObjectKey;
    this.lyricsObjectKey = lyricsObjectKey;
  }

  /**
   * 노래 기본 정보와 전처리 결과 파일 정보를 함께 등록한다.
   */
  public static Song create(
          String title,
          String artist,
          Integer duration,
          Integer difficultyLevel,
          String coverObjectKey,
          String mrObjectKey,
          String midiObjectKey,
          String lyricsObjectKey
  ) {
    return new Song(
            title,
            artist,
            duration,
            difficultyLevel,
            coverObjectKey,
            mrObjectKey,
            midiObjectKey,
            lyricsObjectKey
    );
  }

  /**
   * 제목과 가수명만으로 노래를 우선 등록한다.
   *
   * 음원 전처리가 끝난 뒤 파일 정보를 별도로 갱신할 수 있다.
   */
  public static Song create(String title, String artist) {
    return new Song(
            title,
            artist,
            null,
            null,
            null,
            null,
            null,
            null
    );
  }

  /**
   * 노래 기본 메타데이터를 변경한다.
   */
  public void updateMetadata(
          String title,
          String artist,
          Integer duration,
          Integer difficultyLevel
  ) {
    this.title = title;
    this.artist = artist;
    this.duration = duration;
    this.difficultyLevel = difficultyLevel;
  }

  /**
   * 음원 전처리 완료 후 S3 Object Key를 등록하거나 변경한다.
   */
  public void updateObjectKeys(
          String coverObjectKey,
          String mrObjectKey,
          String midiObjectKey,
          String lyricsObjectKey
  ) {
    this.coverObjectKey = coverObjectKey;
    this.mrObjectKey = mrObjectKey;
    this.midiObjectKey = midiObjectKey;
    this.lyricsObjectKey = lyricsObjectKey;
  }
}