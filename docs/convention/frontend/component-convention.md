# 컴포넌트 컨벤션

## 컴포넌트 작성 원칙

- 하나의 컴포넌트는 하나의 책임만 갖도록 작성 (SRP)
- 200줄을 넘어가면 하위 컴포넌트로 분리 고려
- 비즈니스 로직과 UI 렌더링을 분리 (커스텀 훅으로 로직 추출)

## Props 네이밍

- boolean props는 `is`, `has`, `should` 접두사 사용 (예: `isLoading`, `hasError`)
- 이벤트 핸들러 props는 `on` 접두사 사용 (예: `onClick`, `onSubmit`)
- 목록성 데이터는 복수형으로 (예: `items`, `users`)

## 파일 구성

```
UserProfile/
├── UserProfile.tsx       # 컴포넌트 본체
├── UserProfile.module.scss  # 스타일 (CSS Module 사용 시)
└── index.ts               # re-export
```

## 예시

```tsx
interface UserProfileProps {
  userId: string;
  isEditable?: boolean;
  onEdit?: () => void;
}

export default function UserProfile({ userId, isEditable = false, onEdit }: UserProfileProps) {
  // ...
}
```

## 주석

- 복잡한 로직에는 "왜" 그렇게 했는지 설명하는 주석 작성 (코드가 "무엇"을 하는지는 코드 자체로 드러나야 함)
