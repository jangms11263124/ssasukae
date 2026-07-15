# Frontend Lint & Format 규칙 (Next.js + TypeScript)

## ESLint

`.eslintrc.json` 예시 (Next.js + TypeScript + FSD 기준)

```json
{
  "extends": [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
    "plugin:tailwindcss/recommended",
    "prettier"
  ],
  "plugins": ["@typescript-eslint", "boundaries"],
  "settings": {
    "boundaries/elements": [
      { "type": "app", "pattern": "app/*" },
      { "type": "widgets", "pattern": "widgets/*" },
      { "type": "features", "pattern": "features/*" },
      { "type": "entities", "pattern": "entities/*" },
      { "type": "shared", "pattern": "shared/*" }
    ]
  },
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "import/order": [
      "warn",
      {
        "groups": ["builtin", "external", "internal", "parent", "sibling", "index"],
        "alphabetize": { "order": "asc" }
      }
    ],
    "boundaries/element-types": [
      "error",
      {
        "default": "disallow",
        "rules": [
          { "from": "app", "allow": ["widgets", "features", "entities", "shared"] },
          { "from": "widgets", "allow": ["features", "entities", "shared"] },
          { "from": "features", "allow": ["entities", "shared"] },
          { "from": "entities", "allow": ["shared"] },
          { "from": "shared", "allow": [] }
        ]
      }
    ]
  }
}
```

`boundaries/element-types`는 [폴더 구조](./folder-structure.md#import-규칙-참조-방향) 문서의 레이어 참조 규칙을 그대로 강제합니다. 같은 레이어 내 슬라이스 간 직접 참조 금지는 `boundaries/no-private`, Public API(`index.ts`) 강제는 `boundaries/entry-point` 규칙을 추가로 사용합니다.

## Prettier

`.prettierrc` 예시 (Tailwind 클래스 자동 정렬 포함)

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "tabWidth": 2,
  "printWidth": 100,
  "arrowParens": "always",
  "endOfLine": "lf",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

## EditorConfig

```ini
root = true

[*]
charset = utf-8
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
```

## 원칙

- 스타일 문제는 `warn`, 잠재적 버그(hooks 규칙 위반, FSD 레이어 위반 등)는 `error`
- ESLint-Prettier 충돌 방지를 위해 `eslint-config-prettier` 필수 적용
- `any` 타입 사용 최소화, 사용 시 이유를 주석으로 명시
- Tailwind 클래스는 문자열 조합 대신 `clsx`/`cn` 유틸을 사용하고, `eslint-plugin-tailwindcss`로 중복·오타 클래스를 검출

## Git Hook 자동화 (husky + lint-staged + commitlint)

패키지 매니저는 **pnpm**을 사용합니다.

```bash
pnpm add -D husky lint-staged @commitlint/cli @commitlint/config-conventional
pnpm dlx husky init
```

`package.json`
```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"]
  }
}
```

`.husky/pre-commit`
```bash
pnpm exec lint-staged
```

`.husky/commit-msg`
```bash
pnpm exec commitlint --edit "$1"
```

`commitlint.config.js`
```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
```

## CI 연동

```yaml
# 예시 (GitHub Actions 기준)
- uses: pnpm/action-setup@v4
- run: pnpm install --frozen-lockfile
- run: pnpm lint
- run: pnpm build
```
