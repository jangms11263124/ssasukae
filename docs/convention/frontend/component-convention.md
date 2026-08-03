# 컴포넌트 컨벤션 (Next.js + TypeScript)

## Server Component vs Client Component

- Next.js App Router 기준, **컴포넌트는 기본적으로 Server Component**로 작성합니다.
- 아래 경우에만 파일 최상단에 `'use client'`를 선언합니다.
  - `useState`, `useEffect` 등 리액트 훅 사용
  - 이벤트 핸들러(`onClick` 등) 필요
  - 브라우저 전용 API 사용
  - Zustand store 구독
- 상호작용이 필요한 부분만 최소 단위로 분리해 Client Component로 만들고, 나머지는 Server Component로 유지합니다.

```tsx
'use client';

import { useState } from 'react';

export function LikeButton({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}
```

### 클라이언트 경계와 번들 크기

- `'use client'`는 파일 단위가 아니라 **경계 단위**로 동작합니다. 지시자가 붙은 파일이 import하는
  모듈은 전부 클라이언트 번들에 포함됩니다.
- 따라서 이미 클라이언트 경계 안에서만 렌더링되는 컴포넌트·훅은 지시자를 지워도 번들이 줄지
  않습니다. 최적화의 핵심은 **경계의 시작점을 최대한 말단으로 내리는 것**입니다.
  (예: 공연방은 `GeneralRoomScreen`이 경계 시작점이라 그 하위는 전부 클라이언트)
- 경계 안쪽에서만 쓰이는 컴포넌트·훅에는 지시자를 **새로 붙이지 않습니다** — 이미 클라이언트로
  평가되므로 중복 선언입니다.
- 번들에 실제로 큰 모듈(외부 SDK, 오디오/영상 라이브러리 등)은 지시자 정리보다
  **동적 import(`await import()`)로 필요한 시점에만 로드**하는 것이 효과가 큽니다.

## 컴포넌트 작성 원칙

- 하나의 컴포넌트는 하나의 책임만 갖도록 작성 (SRP)
- 200줄을 넘어가면 하위 컴포넌트로 분리 고려
- 비즈니스 로직과 UI 렌더링을 분리 (`model/` 세그먼트의 커스텀 훅으로 로직 추출)
- 데이터 패칭은 가능하면 Server Component에서 직접, 클라이언트에서 필요한 경우에만 TanStack Query 사용

## Props 네이밍

- boolean props는 `is`, `has`, `should` 접두사 사용 (예: `isLoading`, `hasError`)
- 이벤트 핸들러 props는 `on` 접두사 사용 (예: `onClick`, `onSubmit`)
- 목록성 데이터는 복수형으로 (예: `items`, `users`)

## Export 규칙

- 일반 컴포넌트는 **named export** 사용 (import 시 자동완성, 이름 일관성 확보)
- Next.js가 강제하는 특수 파일만 **default export** 사용: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`

```tsx
// ✅ widgets/header/ui/Header.tsx
export function Header() { /* ... */ }

// ✅ app/(main)/page.tsx (Next.js 특수 파일)
export default function Page() { /* ... */ }
```

## 파일 구성

FSD 슬라이스의 `ui/` 세그먼트 안에 컴포넌트별로 파일을 둡니다. 슬라이스 전체의 공개 API는 슬라이스 루트의 `index.ts`가 담당하므로, 컴포넌트별 `index.ts`는 만들지 않습니다.

```
features/auth-login/
├── ui/
│   └── LoginForm.tsx
├── model/
│   └── useLoginForm.ts
├── api/
│   └── useLoginMutation.ts
└── index.ts                # export { LoginForm } from './ui/LoginForm';
```

## 스타일링 (Tailwind CSS)

- 스타일은 Tailwind 유틸리티 클래스로 작성, 전역 CSS는 `app/globals.css`에만 정의
- 조건부 클래스는 `clsx`(또는 `cn` 유틸)로 조합
  ```tsx
  <button className={cn('rounded px-4 py-2', isActive && 'bg-primary text-white')}>
  ```
- 클래스가 길어지면 의미 단위로 줄바꿈하고, `prettier-plugin-tailwindcss`로 정렬을 자동화 ([Lint 규칙](./lint-rule.md) 참고)
- 반복되는 조합은 컴포넌트로 추출하되, 임의로 `@apply`를 남발하지 않음

## 예시

```tsx
interface UserCardProps {
  userId: string;
  isEditable?: boolean;
  onEdit?: () => void;
}

export function UserCard({ userId, isEditable = false, onEdit }: UserCardProps) {
  // ...
}
```

## 주석

- 복잡한 로직에는 "왜" 그렇게 했는지 설명하는 주석 작성 (코드가 "무엇"을 하는지는 코드 자체로 드러나야 함)
