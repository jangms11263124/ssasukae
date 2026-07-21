import { type NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:8080';

const FORWARD_REQUEST_HEADERS = ['authorization', 'content-type', 'cookie'] as const;
const FORWARD_RESPONSE_HEADERS = ['content-type', 'set-cookie'] as const;

/** refresh 실패 시 남은 HttpOnly 쿠키 제거 (킥 후 새로고침마다 동일 에러 반복 방지) */
function clearRefreshTokenCookie(headers: Headers) {
  headers.append(
    'set-cookie',
    'refreshToken=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
  );
}

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
  const targetPath = pathSegments.join('/');
  const targetUrl = `${API_URL}/api/${targetPath}${request.nextUrl.search}`;

  const headers = new Headers();

  FORWARD_REQUEST_HEADERS.forEach((headerName) => {
    const value = request.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  });

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }

  const backendResponse = await fetch(targetUrl, init);
  const responseHeaders = new Headers();

  FORWARD_RESPONSE_HEADERS.forEach((headerName) => {
    backendResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === headerName) {
        responseHeaders.append(key, value);
      }
    });
  });

  if (targetPath === 'auth/refresh' && !backendResponse.ok) {
    clearRefreshTokenCookie(responseHeaders);

    return new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  }

  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function handle(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
