package com.ssafy.ssasukae.integration.ai;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.ssafy.ssasukae.global.exception.performanceAnalysis.PerformanceAnalysisErrorCode;
import com.ssafy.ssasukae.global.exception.CustomException;

@Component
public class AiServerAuthenticator {

  private final String internalApiKey;

  public AiServerAuthenticator(@Value("${ai.internal-api-key:}") String internalApiKey) {
    this.internalApiKey = internalApiKey;
  }

  public void authenticate(String providedApiKey) {
    if (!StringUtils.hasText(internalApiKey)
        || !StringUtils.hasText(providedApiKey)
        || !MessageDigest.isEqual(
            internalApiKey.getBytes(StandardCharsets.UTF_8),
            providedApiKey.getBytes(StandardCharsets.UTF_8))) {
      throw new CustomException(PerformanceAnalysisErrorCode.UNAUTHORIZED_AI_SERVER);
    }
  }
}
