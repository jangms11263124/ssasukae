package com.ssafy.ssasukae.global.time;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

class TimeConfigTest {

  @Test
  void providesUtcClock() {
    assertThat(new TimeConfig().clock().getZone()).isEqualTo(ZoneOffset.UTC);
  }
}
