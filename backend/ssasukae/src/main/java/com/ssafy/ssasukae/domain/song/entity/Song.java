package com.ssafy.ssasukae.domain.song.entity;

import com.ssafy.ssasukae.domain.song.type.SongStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "songs")
public class Song {

  protected Song() {}

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "song_id")
  private Long id;

  @Column(nullable = false, length = 255)
  private String title;

  @Column(nullable = false, length = 100)
  private String artist;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private SongStatus status;

  private Song(String title, String artist, SongStatus status) {
    this.title = title;
    this.artist = artist;
    this.status = status;
  }

  public static Song create(String title, String artist, SongStatus status) {
    return new Song(title, artist, status);
  }

  public Long getId() {
    return id;
  }

  public String getTitle() {
    return title;
  }

  public String getArtist() {
    return artist;
  }

  public SongStatus getStatus() {
    return status;
  }

  public boolean isReady() {
    return status == SongStatus.READY;
  }
}
