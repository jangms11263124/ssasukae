package com.ssafy.ssasukae.domain.song.repository;

import com.ssafy.ssasukae.domain.song.entity.Song;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SongRepository extends JpaRepository<Song, Long> {
}
