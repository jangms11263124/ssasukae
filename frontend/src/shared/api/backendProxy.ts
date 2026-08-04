import { type NextRequest, NextResponse } from 'next/server';

const API_URL = (process.env.API_URL ?? 'http://localhost:8080').replace(/\/$/, '');

const FORWARD_REQUEST_HEADER_NAMES = [
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'cookie',
] as const;

export function getBackendApiUrl() {
  return API_URL;
}

function buildForwardedHeaders(request: NextRequest): Headers {
  const headers = new Headers();

  FORWARD_REQUEST_HEADER_NAMES.forEach((headerName) => {
    const value = request.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  });

  // 브라우저 → Next 기준 origin (백엔드 HTTPS 연결 스키마에 오염되지 않게 명시)
  const proto = request.nextUrl.protocol.replace(':', '') || 'http';
  const hostname = request.nextUrl.hostname;
  const port =
    request.nextUrl.port ||
    request.headers.get('host')?.split(':')[1] ||
    (proto === 'https' ? '443' : '80');

  // 기존/중간 프록시 forwarded 헤더 제거 후 재설정
  headers.delete('forwarded');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');
  headers.delete('x-forwarded-port');
  headers.delete('x-forwarded-for');
  headers.delete('x-forwarded-prefix');

  // Spring이 host:port를 한 헤더에서 잘못 파싱하는 경우가 있어 Host/Port 분리
  headers.set('X-Forwarded-Host', hostname);
  headers.set('X-Forwarded-Port', port);
  headers.set('X-Forwarded-Proto', proto);
  headers.set('X-Forwarded-For', request.headers.get('x-forwarded-for') ?? '127.0.0.1');
  headers.set(
    'Forwarded',
    `for=127.0.0.1;host=${hostname}:${port};proto=${proto}`,
  );

  return headers;
}

/** 백엔드 Set-Cookie를 프론트 origin 기준으로 맞춤 */
function rewriteSetCookieForFrontend(cookie: string, requestUrl: URL): string {
  let rewritten = cookie.replace(/;\s*Domain=[^;]*/gi, '');

  if (requestUrl.protocol === 'http:') {
    rewritten = rewritten.replace(/;\s*Secure/gi, '');
  }

  return rewritten;
}

function appendBackendSetCookies(
  backendResponse: Response,
  responseHeaders: Headers,
  requestUrl: URL,
) {
  const getSetCookie = backendResponse.headers.getSetCookie?.bind(backendResponse.headers);

  if (getSetCookie) {
    getSetCookie().forEach((cookie) => {
      responseHeaders.append('set-cookie', rewriteSetCookieForFrontend(cookie, requestUrl));
    });
    return;
  }

  const single = backendResponse.headers.get('set-cookie');
  if (single) {
    responseHeaders.append('set-cookie', rewriteSetCookieForFrontend(single, requestUrl));
  }
}

function rewriteLocation(location: string, requestUrl: URL): string {
  if (location.startsWith(API_URL)) {
    return `${requestUrl.origin}${location.slice(API_URL.length)}`;
  }

  return location;
}

export function clearRefreshTokenCookie(headers: Headers) {
  headers.append(
    'set-cookie',
    'refreshToken=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
  );
}

/**
 * 백엔드로 프록시. OAuth 등 리다이렉트는 follow하지 않고 브라우저에 그대로 전달한다.
 */
export async function proxyToBackend(
  request: NextRequest,
  backendPath: string,
  options?: { followRedirects?: boolean },
) {
  const targetUrl = `${API_URL}${backendPath.startsWith('/') ? backendPath : `/${backendPath}`}${request.nextUrl.search}`;
  const headers = buildForwardedHeaders(request);
  const followRedirects = options?.followRedirects ?? false;

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
    redirect: followRedirects ? 'follow' : 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // text()는 UTF-8로 디코딩해 JPEG/PNG 등 multipart 바이너리를 손상시킨다.
    init.body = await request.arrayBuffer();
  }

  const backendResponse = await fetch(targetUrl, init);
  const responseHeaders = new Headers();

  const contentType = backendResponse.headers.get('content-type');
  if (contentType) {
    responseHeaders.set('content-type', contentType);
  }

  const location = backendResponse.headers.get('location');
  if (location) {
    responseHeaders.set('location', rewriteLocation(location, request.nextUrl));
  }

  appendBackendSetCookies(backendResponse, responseHeaders, request.nextUrl);

  // opaque redirect (0) 는 body 없이 status만 전달하면 안 됨 → 실제 status 사용
  const status =
    backendResponse.status === 0 ? 302 : backendResponse.status;

  const body =
    request.method === 'HEAD' || status === 204 || status === 304
      ? null
      : await backendResponse.arrayBuffer();

  return new NextResponse(body, {
    status,
    headers: responseHeaders,
  });
}
