import { ProtectedRoute } from '@/features/auth-guard';

/**
 * 인증이 필요한 라우트만 클라이언트 가드로 감싼다.
 * 로그인·회원가입 등 (public) 영역은 이 레이아웃 밖이라 가드 JS가 불필요하게 돌지 않는다.
 */
export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
