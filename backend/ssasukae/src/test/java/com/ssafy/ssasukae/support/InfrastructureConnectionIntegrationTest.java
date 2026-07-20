package com.ssafy.ssasukae.support;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;

class InfrastructureConnectionIntegrationTest extends IntegrationTestSupport {

  @Autowired private DataSource dataSource;

  @Autowired private StringRedisTemplate redisTemplate;

  @Test
  void connectsToMySql() throws Exception {
    try (var connection = dataSource.getConnection()) {
      assertThat(connection.isValid(1)).isTrue();
    }
  }

  @Test
  void connectsToRedis() {
    String key = "integration-test:redis-connection";

    redisTemplate.opsForValue().set(key, "connected");

    assertThat(redisTemplate.opsForValue().get(key)).isEqualTo("connected");
    redisTemplate.delete(key);
  }
}
