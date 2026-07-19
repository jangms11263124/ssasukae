package com.ssafy.ssasukae.global.security.oauth;

import lombok.Getter;
import lombok.Setter;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app.oauth2")
public class OAuth2Properties {

    private String redirectUri;
    private String signupRedirectUri;
    private String failureRedirectUri;
}
