package com.ssafy.ssasukae.global.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ssafy.ssasukae.global.security.jwt.AuthenticatedUser;

class SecurityContextCurrentUserProviderTest {

  private final CurrentUserProvider currentUserProvider = new SecurityContextCurrentUserProvider();

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void returnsUserIdFromAuthenticatedPrincipal() {
    var principal = new AuthenticatedUser(42L, "user@example.com", "USER");
    var authentication = new UsernamePasswordAuthenticationToken(principal, null, List.of());
    SecurityContextHolder.getContext().setAuthentication(authentication);

    assertThat(currentUserProvider.getCurrentUserId()).isEqualTo(42L);
  }

  @Test
  void rejectsMissingAuthentication() {
    assertThatThrownBy(currentUserProvider::getCurrentUserId)
        .isInstanceOf(AuthenticationCredentialsNotFoundException.class);
  }
}
