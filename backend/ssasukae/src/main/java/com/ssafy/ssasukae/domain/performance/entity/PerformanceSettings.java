package com.ssafy.ssasukae.domain.performance.entity;

import java.util.Objects;

import com.ssafy.ssasukae.global.exception.performance.PerformanceException;

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

  public static final int MIN_KEY_OFFSET = -6;
  public static final int MAX_KEY_OFFSET = 6;
  public static final int MIN_TEMPO_PERCENT = 50;
  public static final int MAX_TEMPO_PERCENT = 150;
  public static final int MIN_VOLUME_PERCENT = 0;
  public static final int MAX_VOLUME_PERCENT = 100;
  public static final int MIN_EFFECT_LEVEL = 0;
  public static final int MAX_EFFECT_LEVEL = 100;

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

  public void validateExpectedVersion(long expectedVersion) {
    if (version != expectedVersion) {
      throw PerformanceException.settingsConflict(expectedVersion, version);
    }
  }

  public boolean updateUserSettings(
      Integer keyOffset,
      Integer tempoPercent,
      Integer mrVolumePercent,
      Integer micVolumePercent,
      Integer echoLevel,
      Integer reverbLevel) {
    validateRequestedValues(
        keyOffset,
        tempoPercent,
        mrVolumePercent,
        micVolumePercent,
        echoLevel,
        reverbLevel);

    boolean changed = false;
    if (keyOffset != null && this.keyOffset != keyOffset) {
      this.keyOffset = keyOffset;
      changed = true;
    }
    if (tempoPercent != null && this.tempoPercent != tempoPercent) {
      this.tempoPercent = tempoPercent;
      changed = true;
    }
    if (mrVolumePercent != null && this.mrVolumePercent != mrVolumePercent) {
      this.mrVolumePercent = mrVolumePercent;
      changed = true;
    }
    if (micVolumePercent != null && this.micVolumePercent != micVolumePercent) {
      this.micVolumePercent = micVolumePercent;
      changed = true;
    }
    if (echoLevel != null && this.echoLevel != echoLevel) {
      this.echoLevel = echoLevel;
      changed = true;
    }
    if (reverbLevel != null && this.reverbLevel != reverbLevel) {
      this.reverbLevel = reverbLevel;
      changed = true;
    }
    return changed;
  }

  private void validateRequestedValues(
      Integer keyOffset,
      Integer tempoPercent,
      Integer mrVolumePercent,
      Integer micVolumePercent,
      Integer echoLevel,
      Integer reverbLevel) {
    if (Objects.isNull(keyOffset)
        && Objects.isNull(tempoPercent)
        && Objects.isNull(mrVolumePercent)
        && Objects.isNull(micVolumePercent)
        && Objects.isNull(echoLevel)
        && Objects.isNull(reverbLevel)) {
      throw PerformanceException.emptySettingsUpdate();
    }
    validateRange("keyOffset", keyOffset, MIN_KEY_OFFSET, MAX_KEY_OFFSET);
    validateRange("tempoPercent", tempoPercent, MIN_TEMPO_PERCENT, MAX_TEMPO_PERCENT);
    validateRange("mrVolumePercent", mrVolumePercent, MIN_VOLUME_PERCENT, MAX_VOLUME_PERCENT);
    validateRange("micVolumePercent", micVolumePercent, MIN_VOLUME_PERCENT, MAX_VOLUME_PERCENT);
    validateRange("echoLevel", echoLevel, MIN_EFFECT_LEVEL, MAX_EFFECT_LEVEL);
    validateRange("reverbLevel", reverbLevel, MIN_EFFECT_LEVEL, MAX_EFFECT_LEVEL);
  }

  private void validateRange(String field, Integer value, int min, int max) {
    if (value != null && (value < min || value > max)) {
      throw PerformanceException.invalidSettingsValue(field, min, max);
    }
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
