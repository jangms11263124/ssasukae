package com.ssafy.ssasukae.domain.performance.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ssafy.ssasukae.global.exception.performance.PerformanceException;

import org.junit.jupiter.api.Test;

class PerformanceSettingsTest {

  @Test
  void partiallyUpdatesUserSettings() {
    PerformanceSettings settings = PerformanceSettings.defaults(null);

    boolean changed = settings.updateUserSettings(2, 110, 80, null, 25, 30);

    assertThat(changed).isTrue();
    assertThat(settings.getKeyOffset()).isEqualTo(2);
    assertThat(settings.getTempoPercent()).isEqualTo(110);
    assertThat(settings.getMrVolumePercent()).isEqualTo(80);
    assertThat(settings.getMicVolumePercent()).isEqualTo(100);
    assertThat(settings.getEchoLevel()).isEqualTo(25);
    assertThat(settings.getReverbLevel()).isEqualTo(30);
  }

  @Test
  void sameValuesAreIdempotent() {
    PerformanceSettings settings = PerformanceSettings.defaults(null);

    boolean changed = settings.updateUserSettings(0, 100, 100, 100, 0, 0);

    assertThat(changed).isFalse();
  }

  @Test
  void rejectsStaleExpectedVersion() {
    PerformanceSettings settings = PerformanceSettings.defaults(null);

    assertThatThrownBy(() -> settings.validateExpectedVersion(1L))
        .isInstanceOf(PerformanceException.class)
        .hasMessageContaining("expectedVersion=1")
        .hasMessageContaining("actualVersion=0");
  }

  @Test
  void rejectsOutOfRangeValue() {
    PerformanceSettings settings = PerformanceSettings.defaults(null);

    assertThatThrownBy(
            () -> settings.updateUserSettings(7, null, null, null, null, null))
        .isInstanceOf(PerformanceException.class)
        .hasMessageContaining("keyOffset");
  }

  @Test
  void rejectsEmptyUpdate() {
    PerformanceSettings settings = PerformanceSettings.defaults(null);

    assertThatThrownBy(
            () -> settings.updateUserSettings(null, null, null, null, null, null))
        .isInstanceOf(PerformanceException.class)
        .hasMessage("변경할 공연 설정을 하나 이상 입력해야 합니다.");
  }
}
