import { type NextRequest } from 'next/server';

import { proxyToBackend } from '@/shared/api/backendProxy';

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function handle(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyToBackend(request, `/oauth2/${path.join('/')}`);
}

export const GET = handle;
export const POST = handle;
