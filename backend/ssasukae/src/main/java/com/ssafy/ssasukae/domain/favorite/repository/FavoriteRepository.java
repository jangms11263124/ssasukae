package com.ssafy.ssasukae.domain.favorite.repository;

import com.ssafy.ssasukae.domain.favorite.entity.Favorite;
import com.ssafy.ssasukae.domain.user.entity.User;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface FavoriteRepository extends JpaRepository<Favorite, Long> {
    @Query("SELECT f FROM Favorite f WHERE f.user.id = :userId AND f.song.id = :songId")
    Optional<Favorite> findByUserAndSong(long userId, long songId);

    @Query("""
        SELECT f
        FROM Favorite f
        JOIN FETCH f.song s
        WHERE f.user = :user
          AND (
              :query = ''
              OR LOWER(s.title) LIKE LOWER(CONCAT('%', :query, '%'))
          )
          AND (
              :cursorCreatedAt IS NULL
              OR f.createdAt < :cursorCreatedAt
              OR (
                  f.createdAt = :cursorCreatedAt
                  AND f.favoriteId < :cursorId
              )
          )
        ORDER BY f.createdAt DESC, f.favoriteId DESC
    """)
    List<Favorite> search(User user, String query, LocalDateTime cursorCreatedAt, Long cursorId, Pageable pageable);

    @Query("SELECT COUNT(f) FROM Favorite f JOIN f.song s WHERE f.user = :user AND :query = '' OR LOWER(s.title) LIKE LOWER(CONCAT('%', :query, '%'))")
    int countByUserAndQuery(User user, String query);

    int countByUser(User user);

    @Query("SELECT f FROM Favorite f WHERE f.user = :user ORDER BY f.createdAt DESC LIMIT 3")
    List<Favorite> findRecentFavor(User user);

    @Query("SELECT f.song.id FROM Favorite f WHERE f.user = :user")
    Set<Long> findSongIdByUser(User user);
}
