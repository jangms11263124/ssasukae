package com.ssafy.ssasukae.domain.song.repository;

import com.ssafy.ssasukae.domain.song.entity.Song;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface SongRepository extends JpaRepository<Song, Long> {

    @Query("SELECT s FROM Song s WHERE ( :query = '' OR LOWER(s.title) LIKE LOWER(CONCAT('%', :query, '%'))) AND (:cursorId IS NULL OR s.id < :cursorId) ORDER BY s.id DESC ")
    List<Song> searchAll(
            @Param("query") String query,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );

    @Query("SELECT s FROM Song s WHERE (:query = '' OR LOWER(s.title) LIKE LOWER(CONCAT('%', :query, '%'))) AND (s.createdAt < :cursorCreatedAt OR (s.createdAt = :cursorCreatedAt AND s.id < :cursorId)) ORDER BY s.createdAt DESC, s.id DESC")
    List<Song> searchRecommend(
            @Param("query") String query,
            @Param("cursorCreatedAt") java.time.LocalDateTime cursorCreatedAt,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );

    @Query("""
            SELECT s
            FROM Song s
            LEFT JOIN Favorite f ON f.song = s
            WHERE (
                :query = ''
                OR LOWER(s.title) LIKE LOWER(CONCAT('%', :query, '%'))
            )
            GROUP BY s
            HAVING (
                :cursorFavoriteCount IS NULL
                OR COUNT(f) < :cursorFavoriteCount
                OR (COUNT(f) = :cursorFavoriteCount AND s.id < :cursorId)
            )
            ORDER BY COUNT(f) DESC, s.id DESC
            """)
    List<Song> searchPopular(
            @Param("query") String query,
            @Param("cursorFavoriteCount") Long cursorFavoriteCount,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );

    @Query("SELECT COUNT(f) FROM Favorite f WHERE f.song.id = :songId")
    long countFavorites(@Param("songId") Long songId);
}
