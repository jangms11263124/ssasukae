package com.ssafy.ssasukae.domain.performance.recovery;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "performance.recovery")
public class PerformanceRecoveryProperties {

  private Duration performerDisconnectGrace = Duration.ofSeconds(15);
  private Duration analysisTimeout = Duration.ofMinutes(2);
  private Duration scanDelay = Duration.ofSeconds(1);
  private int batchSize = 100;
}
