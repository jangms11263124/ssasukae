import Link from 'next/link';

import { AuthShell } from '@/widgets/auth-shell';

interface LoginErrorPageProps {
  searchParams: Promise<{ error?: string | string[] }>;
}

export default async function LoginErrorPage({ searchParams }: LoginErrorPageProps) {
  const params = await searchParams;
  const requestedError = Array.isArray(params.error) ? params.error[0] : params.error;
  const error = requestedError ?? '로그인에 실패했습니다.';

  return (
    <AuthShell>
      <div className="space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">로그인 실패</h1>
          <p className="text-sm leading-relaxed text-zinc-400">{error}</p>
        </div>
        <Link
          href="/login"
          className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-medium text-white transition-colors hover:bg-white/5"
        >
          다시 로그인하기
        </Link>
      </div>
    </AuthShell>
  );
}
