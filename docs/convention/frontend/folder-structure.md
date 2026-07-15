# Frontend 폴더 구조 (FSD + Next.js)

스택: **Next.js (App Router) + TypeScript**. 아키텍처는 **FSD(Feature-Sliced Design)** 를 따르되, `pages` 레이어는 사용하지 않습니다.

> Next.js App Router의 `app/**/page.tsx` 자체가 라우트 단위 화면 조립을 담당하므로, FSD의 `pages` 레이어 역할을 그대로 흡수합니다. 별도의 `pages`/`views` 레이어를 두지 않고 **`app, widgets, features, entities, shared` 5개 레이어**만 사용합니다.

## 레이어 구조

```
src/
├── app/                          # Next.js App Router = FSD app 레이어 (라우팅 + 전역 설정)
│   ├── layout.tsx                # 전역 레이아웃
│   ├── globals.css               # Tailwind 진입 CSS
│   ├── providers/                # 전역 Provider (QueryClientProvider 등)
│   └── (main)/
│       ├── page.tsx              # 라우트 엔트리 — widgets/features를 직접 조립
│       └── board/
│           └── [id]/
│               └── page.tsx
│
├── widgets/                      # 여러 features/entities를 조합한 독립적 UI 블록
│   └── header/
│       ├── ui/Header.tsx
│       └── index.ts
│
├── features/                     # 사용자 행동 단위 기능 (좋아요, 로그인 등)
│   └── auth-login/
│       ├── ui/LoginForm.tsx
│       ├── model/useLoginForm.ts
│       ├── api/useLoginMutation.ts   # TanStack Query mutation
│       └── index.ts
│
├── entities/                     # 비즈니스 엔티티 (User, Board 등)
│   └── user/
│       ├── ui/UserCard.tsx
│       ├── model/userStore.ts        # Zustand store
│       ├── api/useUserQuery.ts       # TanStack Query
│       ├── types.ts
│       └── index.ts
│
└── shared/                       # 도메인 지식 없는 전역 재사용 자원
    ├── ui/                        # Button, Input 등 공통 컴포넌트
    ├── api/                       # axios/fetch 인스턴스, queryClient 설정
    ├── config/                    # 환경 변수, 상수
    ├── lib/                       # 유틸 함수, 커스텀 훅
    └── types/                     # 전역 공통 타입
```

## 레이어별 역할

| 레이어 | 역할 | 예시 |
|---|---|---|
| `app` | 앱 전역 설정, 라우팅, 라우트 단위 화면 조립 (Next.js App Router와 통합) | `layout.tsx`, `providers/`, `page.tsx` |
| `widgets` | 여러 feature/entity를 조합한 독립적 UI 블록 | `header/`, `sidebar/` |
| `features` | 사용자 행동 단위의 기능 | `auth-login/`, `board-like/` |
| `entities` | 비즈니스 엔티티(도메인 모델)와 그에 대한 기본 UI/API | `user/`, `board/` |
| `shared` | 도메인 지식이 없는 전역 재사용 자원 | `shared/ui`, `shared/lib` |

각 슬라이스(`widgets/header`, `features/auth-login` 등) 내부는 필요한 세그먼트만 둡니다.

| 세그먼트 | 역할 |
|---|---|
| `ui` | 컴포넌트 |
| `model` | 상태(Zustand store), 비즈니스 로직, 커스텀 훅 |
| `api` | TanStack Query hook, API 요청 함수 |
| `lib` | 해당 슬라이스 전용 유틸 |
| `config` | 해당 슬라이스 전용 상수/설정 |

## Next.js App Router와의 관계

- `src/app/`은 Next.js가 강제하는 라우팅 디렉터리이자 FSD의 `app` 레이어를 겸합니다.
- 별도의 `pages`/`views` 레이어 없이, **`app/**/page.tsx`가 직접 `widgets`/`features`를 조합**해 화면을 구성합니다.
- `page.tsx`는 데이터 패칭 조합과 위젯 배치까지 담당할 수 있으나, 세부 로직은 각 레이어(`widgets`, `features`)로 위임하고 `page.tsx` 자체는 얇게 유지합니다.
- **`src/pages` 디렉터리는 만들지 않습니다.** Next.js가 이를 Pages Router 진입점으로 인식해 App Router와 충돌합니다.

```tsx
// app/(main)/board/[id]/page.tsx
import { BoardHeader } from '@/widgets/board-header';
import { BoardLikeButton } from '@/features/board-like';
import { BoardContent } from '@/entities/board';

export default function Page({ params }: { params: { id: string } }) {
  return (
    <>
      <BoardHeader boardId={params.id} />
      <BoardContent boardId={params.id} />
      <BoardLikeButton boardId={params.id} />
    </>
  );
}
```

## Import 규칙 (참조 방향)

- 상위 레이어만 하위 레이어를 참조할 수 있습니다: `app → widgets → features → entities → shared`
- **역방향 참조 금지** (`shared`가 `entities`를 참조하는 등)
- **같은 레이어의 다른 슬라이스 간 직접 참조 금지** (`features/auth-login`이 `features/board-like` 내부 파일을 직접 import 금지)
- 슬라이스 외부에서는 반드시 슬라이스 루트의 `index.ts`(Public API)를 통해서만 import
  ```ts
  // ✅
  import { useUserQuery } from '@/entities/user';
  // ❌ 슬라이스 내부 파일 직접 참조
  import { useUserQuery } from '@/entities/user/api/useUserQuery';
  ```
- 위 규칙은 `eslint-plugin-boundaries`로 자동 검증합니다 ([Lint 규칙](./lint-rule.md) 참고).

## 네이밍 규칙

| 대상 | 규칙 | 예시 |
|---|---|---|
| 슬라이스 폴더명 | kebab-case | `auth-login/`, `board-header/` |
| 세그먼트 폴더명 | 고정 (`ui`, `model`, `api`, `lib`, `config`) | `ui/`, `model/` |
| 컴포넌트 파일/이름 | PascalCase | `UserCard.tsx` |
| 훅 | camelCase, `use` 접두사 | `useLoginForm.ts` |
| Zustand store | camelCase, `Store` 접미사 | `userStore.ts` |
| TanStack Query 훅 | camelCase, `use...Query`/`use...Mutation` | `useUserQuery.ts` |
| 일반 변수/함수 | camelCase | `getUserInfo` |
| 상수 | SNAKE_CASE (대문자) | `MAX_RETRY_COUNT` |
| 타입/인터페이스 | PascalCase | `UserResponse` |

## 원칙

- 새 기능은 먼저 `features`/`entities` 중 어디에 속하는지 판단 후 슬라이스를 생성 (도메인 모델이면 `entities`, 사용자 행동이면 `features`)
- 슬라이스가 커지면 세그먼트를 늘리되, 세그먼트 간 책임은 분리 유지 (UI에 API 호출 로직 직접 작성 금지)
- 공통으로 3번 이상 재사용되는 경우에만 `shared`로 승격
- `page.tsx`는 조립만 담당하고, 조립 로직이 복잡해지면 `widgets`로 승격해 재사용 가능하게 분리
