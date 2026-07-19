package com.ssafy.ssasukae.global.security.oauth.principal;

import com.ssafy.ssasukae.domain.auth.dto.OAuthLoginResult;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.util.Collection;
import java.util.List;
import java.util.Map;

@Getter
@RequiredArgsConstructor
public class CustomOAuth2User implements OAuth2User {

    private final OAuthLoginResult loginResult;
    private final Map<String, Object> attributes;

    public boolean isRegistered() {
        return loginResult.isRegistered();
    }

    @Override
    public Map<String, Object> getAttributes() {
        return attributes;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        if (!isRegistered()) {
            return List.of();
        }

        return List.of(
                new SimpleGrantedAuthority("ROLE_" + loginResult.getUser().getRole().name())
        );
    }

    @Override
    public String getName() {
        if (!isRegistered()) {
            return loginResult.getProvider() + ":" + loginResult.getProviderId();
        }

        return String.valueOf(loginResult.getUser().getId());
    }

    public Long getUserId() {
        return loginResult.getUser().getId();
    }

    public String getEmail() {
        return loginResult.getUser().getEmail();
    }

    public String getRole() {
        return loginResult.getUser().getRole().name();
    }
}
