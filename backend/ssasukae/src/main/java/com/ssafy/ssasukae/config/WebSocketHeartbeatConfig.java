package com.ssafy.ssasukae.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration(proxyBeanMethods = false)
public class WebSocketHeartbeatConfig {

  @Bean("roomWebSocketHeartbeatTaskScheduler")
  public TaskScheduler roomWebSocketHeartbeatTaskScheduler() {
    ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
    scheduler.setPoolSize(1);
    scheduler.setThreadNamePrefix("room-ws-heartbeat-");
    scheduler.setRemoveOnCancelPolicy(true);
    return scheduler;
  }
}
