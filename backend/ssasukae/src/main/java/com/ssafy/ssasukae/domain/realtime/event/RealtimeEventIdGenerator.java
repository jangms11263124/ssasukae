package com.ssafy.ssasukae.domain.realtime.event;

@FunctionalInterface
public interface RealtimeEventIdGenerator {

  long nextId();
}
