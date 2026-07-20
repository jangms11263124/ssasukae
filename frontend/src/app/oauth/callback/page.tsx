import { Suspense } from 'react';

import { OAuthCallbackHandler } from '@/features/auth-callback';
import { AuthShell } from '@/widgets/auth-shell';

export default function OAuthCallbackPage() {
  return (
    <AuthShell>
      <Suspense fallback={<p className="text-center text-sm text-zinc-400">불러오는 중...</p>}>
        <OAuthCallbackHandler />
      </Suspense>
    </AuthShell>
  );
}
