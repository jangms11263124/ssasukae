package com.ssafy.ssasukae.domain.card.service;

import java.util.concurrent.ThreadLocalRandom;

import org.springframework.stereotype.Component;

@Component
public class ThreadLocalCardRandomGenerator implements CardRandomGenerator {

  @Override
  public int nextInt(int bound) {
    return ThreadLocalRandom.current().nextInt(bound);
  }
}
