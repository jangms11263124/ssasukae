# Git 브랜치 전략 (Git-flow)

FE/BE 공통으로 적용되는 브랜치 전략입니다.

## 브랜치 구조

| 브랜치 | 역할 | 생명주기 |
|---|---|---|
| `main` (`master`) | 배포 가능한 상태만 유지 | 영구 |
| `develop` | 다음 배포를 위한 통합 개발 브랜치 | 영구 |
| `feature/*` | 개별 기능 개발 | 완료 후 삭제 |
| `release/*` | 배포 준비/QA | 배포 후 삭제 |
| `hotfix/*` | 프로덕션 긴급 수정 | 완료 후 삭제 |

```
feature/*  ──▶ develop ──▶ release/* ──▶ main
                  ▲                        │
                  └────────hotfix/* ◀───────┘
```

## 운영 원칙

- `main`, `develop`은 **직접 커밋 금지**, 반드시 PR을 통해 병합
- `feature`는 `develop`에서 분기 → `develop`으로 병합
- `hotfix`는 `main`에서 분기 → `main`과 `develop` 양쪽에 병합
- 병합된 브랜치는 원격/로컬 모두 즉시 삭제

## 브랜치 네이밍 규칙

```
<type>/<이슈번호>-<간단한-설명>
```

| 타입 | 용도 | 예시 |
|---|---|---|
| `feature` | 신규 기능 | `feature/123-login-page` |
| `fix` | 버그 수정 (develop 대상) | `fix/145-header-overlap` |
| `hotfix` | 긴급 수정 (main 대상) | `hotfix/201-payment-error` |
| `release` | 배포 준비 | `release/1.4.0` |
| `chore` | 빌드/설정 등 잡무 | `chore/210-update-deps` |
| `refactor` | 리팩토링 | `refactor/98-api-layer` |

- 소문자 + 하이픈(`-`) 사용
- 이슈 트래커 번호를 포함해 추적 용이하게 작성

## 기타

- **Merge 방식**: `feature → develop`은 Squash Merge, `release/hotfix → main`은 Merge Commit 권장
- **Rebase**: 본인 feature 브랜치 정리 시에만 사용, 이미 공유된 브랜치는 지양
- **버전 관리**: [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`) 준수, `main` 머지 시 태그 생성
