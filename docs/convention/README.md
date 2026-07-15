# 컨벤션 문서

## 폴더 구조

```
docs/convention/
├── README.md
├── common/                        # FE·BE 공통 협업 프로세스 규칙
│   ├── git-branch-strategy.md     # Git 브랜치 전략
│   ├── commit-message.md          # 커밋 메시지 컨벤션
│   ├── pr-rule.md                 # PR 규칙
│   └── code-review-guide.md       # 코드 리뷰 가이드
├── frontend/                      # 프론트엔드 스택 종속 규칙 (Next.js + TypeScript)
│   ├── lint-rule.md               # Lint & Format 규칙
│   ├── folder-structure.md        # 폴더 구조 (FSD)
│   └── component-convention.md    # 컴포넌트 컨벤션
└── backend/                       # 백엔드 스택 종속 규칙
    ├── lint-rule.md                # Lint & Format 규칙
    ├── package-structure.md        # 패키지 구조
    └── api-convention.md           # API 컨벤션
```

## 분리 원칙

- **common/**: FE·BE 관계없이 적용되는 협업 프로세스 규칙 (언어/프레임워크를 바꿔도 그대로 쓸 수 있는 것)
- **frontend/**: 프론트엔드 스택에 종속적인 규칙 (Next.js, TypeScript, ESLint 등)
- **backend/**: 백엔드 스택에 종속적인 규칙 (Java/Spring, Spotless 등)

> common 문서는 FE/BE 리드가 함께 합의해서 수정합니다.
> frontend/, backend/ 문서는 각 트랙에서 자율적으로 관리합니다.

## 목차

### 공통 (Common)
- [Git 브랜치 전략](./common/git-branch-strategy.md)
  - [브랜치 구조](./common/git-branch-strategy.md#브랜치-구조)
  - [운영 원칙](./common/git-branch-strategy.md#운영-원칙)
  - [브랜치 네이밍 규칙](./common/git-branch-strategy.md#브랜치-네이밍-규칙)
  - [기타](./common/git-branch-strategy.md#기타)
- [커밋 메시지 컨벤션](./common/commit-message.md)
  - [형식](./common/commit-message.md#형식)
  - [Type 목록](./common/commit-message.md#type-목록)
  - [예시](./common/commit-message.md#예시)
  - [작성 규칙](./common/commit-message.md#작성-규칙)
  - [자동 검증](./common/commit-message.md#자동-검증)
- [PR 규칙](./common/pr-rule.md)
  - [제목 형식](./common/pr-rule.md#제목-형식)
  - [PR 템플릿](./common/pr-rule.md#pr-템플릿)
    - [작업 내용](./common/pr-rule.md#작업-내용)
    - [스크린샷 (UI 변경 시 필수)](./common/pr-rule.md#스크린샷-ui-변경-시-필수)
    - [체크리스트](./common/pr-rule.md#체크리스트)
    - [관련 이슈](./common/pr-rule.md#관련-이슈)
  - [규칙](./common/pr-rule.md#규칙)
- [코드 리뷰 가이드](./common/code-review-guide.md)
  - [Lint는 리뷰 전에 자동으로 걸러낸다](./common/code-review-guide.md#lint는-리뷰-전에-자동으로-걸러낸다)

### 프론트엔드 (Frontend, Next.js + TypeScript)
- [Lint & Format 규칙 (ESLint/Prettier)](./frontend/lint-rule.md)
  - [ESLint](./frontend/lint-rule.md#eslint)
  - [Prettier](./frontend/lint-rule.md#prettier)
  - [EditorConfig](./frontend/lint-rule.md#editorconfig)
  - [원칙](./frontend/lint-rule.md#원칙)
  - [Git Hook 자동화 (husky + lint-staged + commitlint)](./frontend/lint-rule.md#git-hook-자동화-husky--lint-staged--commitlint)
  - [CI 연동](./frontend/lint-rule.md#ci-연동)
- [폴더 구조 (FSD)](./frontend/folder-structure.md)
  - [레이어 구조](./frontend/folder-structure.md#레이어-구조)
  - [레이어별 역할](./frontend/folder-structure.md#레이어별-역할)
  - [Next.js App Router와의 관계](./frontend/folder-structure.md#nextjs-app-router와의-관계)
  - [Import 규칙 (참조 방향)](./frontend/folder-structure.md#import-규칙-참조-방향)
  - [네이밍 규칙](./frontend/folder-structure.md#네이밍-규칙)
  - [원칙](./frontend/folder-structure.md#원칙)
- [컴포넌트 컨벤션](./frontend/component-convention.md)
  - [Server Component vs Client Component](./frontend/component-convention.md#server-component-vs-client-component)
  - [컴포넌트 작성 원칙](./frontend/component-convention.md#컴포넌트-작성-원칙)
  - [Props 네이밍](./frontend/component-convention.md#props-네이밍)
  - [Export 규칙](./frontend/component-convention.md#export-규칙)
  - [파일 구성](./frontend/component-convention.md#파일-구성)
  - [스타일링 (Tailwind CSS)](./frontend/component-convention.md#스타일링-tailwind-css)
  - [예시](./frontend/component-convention.md#예시)
  - [주석](./frontend/component-convention.md#주석)

### 백엔드 (Backend)
- [Lint & Format 규칙 (Spotless)](./backend/lint-rule.md)
  - [Gradle 설정 예시](./backend/lint-rule.md#gradle-설정-예시)
  - [로컬 명령어](./backend/lint-rule.md#로컬-명령어)
  - [Git Hook 자동화 (pre-commit)](./backend/lint-rule.md#git-hook-자동화-pre-commit)
  - [CI 연동](./backend/lint-rule.md#ci-연동)
  - [원칙](./backend/lint-rule.md#원칙)
- [패키지 구조](./backend/package-structure.md)
  - [예시 (도메인 기준 구조)](./backend/package-structure.md#예시-도메인-기준-구조)
  - [네이밍 규칙](./backend/package-structure.md#네이밍-규칙)
  - [원칙](./backend/package-structure.md#원칙)
- [API 컨벤션 (REST)](./backend/api-convention.md)
  - [URL 규칙](./backend/api-convention.md#url-규칙)
  - [공통 응답 포맷](./backend/api-convention.md#공통-응답-포맷)
  - [HTTP 상태 코드 원칙](./backend/api-convention.md#http-상태-코드-원칙)
  - [예외 처리](./backend/api-convention.md#예외-처리)
