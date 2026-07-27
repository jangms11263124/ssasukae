package com.ssafy.ssasukae.config;

import io.openvidu.java.client.OpenVidu;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenViduConfig {

    @Bean
    public OpenVidu openVidu(
            @Value("${openvidu.url}") String openViduUrl,
            @Value("${openvidu.secret}") String openViduSecret
    ) {
        return new OpenVidu(openViduUrl, openViduSecret);
    }
}
