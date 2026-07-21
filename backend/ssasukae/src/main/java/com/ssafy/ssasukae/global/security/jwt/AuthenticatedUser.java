package com.ssafy.ssasukae.global.security.jwt;

import java.security.Principal;

public record AuthenticatedUser(Long userId, String email, String role) implements Principal {

  @Override
  public String getName() {
    return userId.toString();
  }
}
