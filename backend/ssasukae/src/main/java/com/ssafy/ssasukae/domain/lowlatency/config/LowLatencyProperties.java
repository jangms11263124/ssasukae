package com.ssafy.ssasukae.domain.lowlatency.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "low-latency")
public class LowLatencyProperties {

  private String rendezvousServer;
}
