package com.ssafy.ssasukae.domain.performance.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;

@Entity
@Table(
    name = "performance_settings",
    uniqueConstraints =
        @UniqueConstraint(
            name = "uk_performance_settings_performance",
            columnNames = "performance_id"))
public class PerformanceSettings {

  private static final int DEFAULT_KEY_OFFSET = 0;
  private static final int DEFAULT_TEMPO_PERCENT = 100;
  private static final int DEFAULT_VOLUME_PERCENT = 100;
  private static final int DEFAULT_EFFECT_LEVEL = 0;

  protected PerformanceSettings() {}

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "performance_settings_id")
  private Long id;

  @OneToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "performance_id", nullable = false)
  private Performance performance;

  @Column(name = "key_offset", nullable = false)
  private int keyOffset;

  @Column(name = "tempo_percent", nullable = false)
  private int tempoPercent;

  @Column(name = "mr_volume_percent", nullable = false)
  private int mrVolumePercent;

  @Column(name = "mic_volume_percent", nullable = false)
  private int micVolumePercent;

  @Column(name = "echo_level", nullable = false)
  private int echoLevel;

  @Column(name = "reverb_level", nullable = false)
  private int reverbLevel;

  @Version
  @Column(nullable = false)
  private long version;

  private PerformanceSettings(Performance performance) {
    this.performance = performance;
    this.keyOffset = DEFAULT_KEY_OFFSET;
    this.tempoPercent = DEFAULT_TEMPO_PERCENT;
    this.mrVolumePercent = DEFAULT_VOLUME_PERCENT;
    this.micVolumePercent = DEFAULT_VOLUME_PERCENT;
    this.echoLevel = DEFAULT_EFFECT_LEVEL;
    this.reverbLevel = DEFAULT_EFFECT_LEVEL;
  }

  public static PerformanceSettings defaults(Performance performance) {
    return new PerformanceSettings(performance);
  }

  public Long getId() {
    return id;
  }

  public Performance getPerformance() {
    return performance;
  }

  public int getKeyOffset() {
    return keyOffset;
  }

  public int getTempoPercent() {
    return tempoPercent;
  }

  public int getMrVolumePercent() {
    return mrVolumePercent;
  }

  public int getMicVolumePercent() {
    return micVolumePercent;
  }

  public int getEchoLevel() {
    return echoLevel;
  }

  public int getReverbLevel() {
    return reverbLevel;
  }

  public long getVersion() {
    return version;
  }
}
