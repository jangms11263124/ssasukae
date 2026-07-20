function decodeBase64UrlToUtf8(payload: string): string {
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

export function decodeJwtPayload<T>(token: string): T | null {
  try {
    const payload = token.split('.')[1];

    if (!payload) {
      return null;
    }

    const decoded = decodeBase64UrlToUtf8(payload);

    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}
