# Frontend 폴더 구조

## 예시 (React + TypeScript)

```
src/
├── assets/            # 이미지, 폰트 등 정적 리소스
├── components/        # 공통/재사용 컴포넌트
│   └── common/
├── pages/              # 라우트 단위 페이지 컴포넌트
├── hooks/              # 커스텀 훅
├── store/              # 전역 상태 관리 (Redux/Zustand 등)
├── api/                 # API 요청 함수, axios 인스턴스
├── types/               # 공통 타입/인터페이스
├── utils/               # 순수 함수, 헬퍼
├── styles/              # 전역 스타일, 테마
└── constants/           # 상수
```

## 네이밍 규칙

| 대상 | 규칙 | 예시 |
|---|---|---|
| 컴포넌트 파일/이름 | PascalCase | `UserProfile.tsx` |
| 훅 | camelCase, `use` 접두사 | `useAuth.ts` |
| 일반 변수/함수 | camelCase | `getUserInfo` |
| 상수 | SNAKE_CASE (대문자) | `MAX_RETRY_COUNT` |
| 타입/인터페이스 | PascalCase | `UserResponse` |
| 폴더명 | kebab-case 또는 camelCase (팀 합의) | `user-profile/` |

## 원칙

- 페이지 단위(`pages/`)와 재사용 컴포넌트(`components/`)를 명확히 분리
- 도메인이 커지면 `components/` 하위를 도메인별 폴더로 세분화 고려 (예: `components/auth/`, `components/board/`)
- API 요청 로직은 컴포넌트에 직접 두지 않고 `api/` 레이어로 분리
