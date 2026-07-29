package com.ssafy.ssasukae.config;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
public class PerformanceRecoveryConfig {

  @Bean
  public Clock systemClock() {
    return Clock.systemUTC();
  }
}
