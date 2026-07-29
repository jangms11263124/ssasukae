package com.ssafy.ssasukae.domain.performanceResult.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.ssafy.ssasukae.domain.song.entity.Song;
import com.ssafy.ssasukae.domain.user.entity.User;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import lombok.Getter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "performance_results")
@EntityListeners(AuditingEntityListener.class)
@Getter
public class PerformanceResult {

  protected PerformanceResult() {}

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "performance_id")
  private Long id;

  /**
   * 공연한 노래
   */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "song_id", nullable = false)
  private Song song;

  /**
   * 공연을 수행한 사용자
   */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private User user;

  /**
   * 음정 점수
   */
  @Column(name = "pitch_score", nullable = false, precision = 5, scale = 2)
  private BigDecimal pitchScore;

  /**
   * 박자 점수
   */
  @Column(name = "rhythm_score", nullable = false, precision = 5, scale = 2)
  private BigDecimal rhythmScore;

  /**
   * 가사 정확도 점수
   */
  @Column(name = "lyrics_score", nullable = false, precision = 5, scale = 2)
  private BigDecimal lyricsScore;

  /**
   * 음정 또는 발성 안정성 점수
   */
  @Column(name = "stability_score", precision = 5, scale = 2)
  private BigDecimal stabilityScore;

  /**
   * 최종 종합 점수
   */
  @Column(name = "final_score", nullable = false, precision = 5, scale = 2)
  private BigDecimal finalScore;

  /**
   * 공연 결과에 대한 피드백
   */
  @Column(name = "feedback",  nullable = true, columnDefinition = "TEXT")
  private String feedback;

  /**
   * 공연 결과 생성 일시
   */
  @CreatedDate
  @Column(name = "created_at", nullable = false, updatable = false)
  private LocalDateTime createdAt;

  private PerformanceResult(
          Song song,
          User user,
          BigDecimal pitchScore,
          BigDecimal rhythmScore,
          BigDecimal lyricsScore,
          BigDecimal stabilityScore,
          BigDecimal finalScore) {
    this.song = song;
    this.user = user;
    this.pitchScore = pitchScore;
    this.rhythmScore = rhythmScore;
    this.lyricsScore = lyricsScore;
    this.stabilityScore = stabilityScore;
    this.finalScore = finalScore;
  }

  /**
   * 채점이 완료된 공연 결과를 생성한다.
   */
  public static PerformanceResult create(
          Song song,
          User user,
          BigDecimal pitchScore,
          BigDecimal rhythmScore,
          BigDecimal lyricsScore,
          BigDecimal stabilityScore,
          BigDecimal finalScore) {
    return new PerformanceResult(
            song,
            user,
            pitchScore,
            rhythmScore,
            lyricsScore,
            stabilityScore,
            finalScore);
  }
}