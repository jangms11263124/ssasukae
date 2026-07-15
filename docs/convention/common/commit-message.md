# 커밋 메시지 컨벤션

[Conventional Commits](https://www.conventionalcommits.org/) 규칙을 따릅니다. FE/BE 공통 적용.

## 형식

```
<type>(<scope>): <subject>

<body> (선택)

<footer> (선택, 이슈 연결 등)
```

## Type 목록

| Type | 설명 |
|---|---|
| `feat` | 새로운 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 수정 |
| `style` | 코드 포맷팅 등 (로직 변경 없음) |
| `refactor` | 기능 변경 없는 코드 구조 개선 |
| `test` | 테스트 코드 추가/수정 |
| `chore` | 빌드, 패키지 매니저 등 기타 변경 |
| `perf` | 성능 개선 |
| `build` | 빌드 시스템/외부 의존성 관련 |
| `ci` | CI 설정 변경 |

## 예시

```
feat(auth): 카카오 소셜 로그인 기능 추가

- 카카오 SDK 초기화 로직 추가
- 로그인 성공 시 토큰 저장 처리

Closes #123
```

```
fix(header): 모바일 뷰포트에서 네비게이션 겹침 현상 수정
```

## 작성 규칙

- 제목은 **50자 이내**, 마침표 없이 작성
- 제목은 명령형으로 작성 (예: "수정함" ❌ → "수정" ⭕)
- 하나의 커밋에는 하나의 논리적 변경사항만 포함
- `scope`는 영향받는 모듈/컴포넌트명 (예: `auth`, `header`, `api`)

## 자동 검증

`commitlint`를 git hook(`commit-msg`)에 연동하여, 컨벤션에 맞지 않는 커밋 메시지는 커밋 자체를 차단합니다. 구체적인 도구 설정(husky 등)은 각 트랙의 lint 문서를 참고하세요.
