# Backend Lint & Format 규칙 (Java / Spotless)

Java 백엔드는 **Spotless**를 lint/formatter로 통일하여 사용합니다.
(별도의 Checkstyle/PMD 없이 Spotless 하나로 포맷 + 스타일 검사를 처리)

## Gradle 설정 예시

`build.gradle`
```groovy
plugins {
    id 'com.diffplug.spotless' version '6.25.0'
}

spotless {
    java {
        target 'src/*/java/**/*.java'

        // Google Java Style 기준 포맷팅
        googleJavaFormat('1.22.0')

        removeUnusedImports()
        trimTrailingWhitespace()
        endWithNewline()

        // 커스텀 룰이 필요하면 importOrder 등 추가 가능
        importOrder('java', 'javax', 'org', 'com', '')
    }
}
```

> Google Java Format 대신 팀 취향에 따라 `palantirJavaFormat()`으로 대체 가능합니다.

## 로컬 명령어

```bash
# 위반 사항 확인만 (수정 X)
./gradlew spotlessCheck

# 자동으로 포맷 적용
./gradlew spotlessApply
```

## Git Hook 자동화 (pre-commit)

FE의 husky/lint-staged와 동일한 역할을 하도록 pre-commit hook을 구성합니다.

`.githooks/pre-commit`
```bash
#!/bin/sh
./gradlew spotlessCheck
if [ $? -ne 0 ]; then
  echo "❌ Spotless 검사 실패: './gradlew spotlessApply' 실행 후 다시 커밋해주세요."
  exit 1
fi
```

적용:
```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

## CI 연동

CI 파이프라인(예: GitHub Actions, GitLab CI)에서도 동일하게 검증합니다.

```yaml
# 예시 (GitHub Actions 기준)
- name: Spotless Check
  run: ./gradlew spotlessCheck
```

## 원칙

- **커밋 전(pre-commit) + CI** 양쪽에서 `spotlessCheck`를 강제하여, 포맷이 깨진 코드는 애초에 커밋/머지가 안 되도록 함
- 포맷 규칙 자체(들여쓰기, import 순서 등)에 대한 논쟁은 team 합의로 `build.gradle` 설정 한 곳에서만 관리 — 개인 IDE 설정에 의존하지 않음
- 리뷰어는 포맷을 지적하지 않고 로직/설계에 집중 ([code-review-guide.md](../common/code-review-guide.md) 참고)
