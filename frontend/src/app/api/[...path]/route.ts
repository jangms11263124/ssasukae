import { type NextRequest, NextResponse } from 'next/server';

import {
  clearRefreshTokenCookie,
  proxyToBackend,
} from '@/shared/api/backendProxy';
import { isSessionKickedMessage } from '@/shared/config/session';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function handle(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const targetPath = path.join('/');
  const response = await proxyToBackend(request, `/api/${targetPath}`, {
    followRedirects: true,
  });

  if (targetPath === 'auth/refresh' && !response.ok) {
    const bodyText = await response.text();
    const headers = new Headers(response.headers);

    try {
      const errorBody = JSON.parse(bodyText) as { message?: string };
      if (isSessionKickedMessage(errorBody.message)) {
        clearRefreshTokenCookie(headers);
      }
    } catch {
      // ignore
    }

    return new NextResponse(bodyText, {
      status: response.status,
      headers,
    });
  }

  return response;
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
