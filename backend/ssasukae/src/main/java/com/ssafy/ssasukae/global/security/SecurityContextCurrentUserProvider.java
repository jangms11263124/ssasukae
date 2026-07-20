package com.ssafy.ssasukae.global.security;

import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

@Component
public class SecurityContextCurrentUserProvider implements CurrentUserProvider {

  @Override
  public Long getCurrentUserId() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

    if (authentication == null
        || !(authentication.getPrincipal() instanceof AuthenticatedUser user)) {
      throw new AuthenticationCredentialsNotFoundException("인증된 사용자 정보를 찾을 수 없습니다.");
    }

    return user.userId();
  }
}
