# 코드 리뷰 가이드

- 리뷰는 **24시간 이내** 응답을 원칙으로 함
- 코멘트는 지적이 아닌 제안 형태로 작성 (예: "이 부분은 ~하는 게 어떨까요?")
- 사소한 스타일 지적보다는 로직, 성능, 가독성, 재사용성 위주로 리뷰
- Nitpick(사소한 의견)은 `[nit]` 접두사로 구분하여 머지를 막지 않도록 함
- 큰 구조적 변경이 필요하다면 PR 코멘트보다 별도 논의(회의/스레드) 권장

## Lint는 리뷰 전에 자동으로 걸러낸다

스타일/포맷 문제(들여쓰기, 세미콜론, import 순서 등)는 사람이 리뷰에서 지적하지 않고, **커밋 전 자동 검사(pre-commit hook)** 와 **CI**에서 걸러지도록 합니다. 즉:

- 리뷰어는 스타일이 아니라 **로직/설계**에 집중
- 각 트랙(FE/BE)은 lint 도구를 pre-commit hook과 CI 파이프라인 양쪽에 연동
  - FE: ESLint + Prettier + husky/lint-staged → [frontend/lint-rule.md](../frontend/lint-rule.md)
  - BE: Spotless → [backend/lint-rule.md](../backend/lint-rule.md)

이 원칙(자동 검사 강제)은 공통이지만, 실제 도구/설정은 트랙별 문서에서 관리합니다.
