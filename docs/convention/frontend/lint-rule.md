# Frontend Lint & Format 규칙

## ESLint

`.eslintrc.json` 예시 (React + TypeScript 기준)

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
    "prettier"
  ],
  "plugins": ["@typescript-eslint", "react", "react-hooks", "import"],
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "react/react-in-jsx-scope": "off",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "import/order": [
      "warn",
      {
        "groups": ["builtin", "external", "internal", "parent", "sibling", "index"],
        "alphabetize": { "order": "asc" }
      }
    ]
  }
}
```

## Prettier

`.prettierrc` 예시

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "tabWidth": 2,
  "printWidth": 100,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

## Stylelint (CSS/SCSS)

`.stylelintrc.json` 예시

```json
{
  "extends": ["stylelint-config-standard", "stylelint-config-prettier"],
  "rules": {
    "color-hex-length": "long",
    "selector-class-pattern": "^[a-z][a-zA-Z0-9]+$",
    "no-descending-specificity": null
  }
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

- 스타일 문제는 `warn`, 잠재적 버그(hooks 규칙 위반 등)는 `error`
- ESLint-Prettier 충돌 방지를 위해 `eslint-config-prettier` 필수 적용
- `any` 타입 사용 최소화, 사용 시 이유를 주석으로 명시

## Git Hook 자동화 (husky + lint-staged + commitlint)

```bash
npm install --save-dev husky lint-staged @commitlint/cli @commitlint/config-conventional
npx husky init
```

`package.json`
```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{css,scss}": ["stylelint --fix"]
  }
}
```

`.husky/pre-commit`
```bash
npx lint-staged
```

`.husky/commit-msg`
```bash
npx --no -- commitlint --edit "$1"
```

`commitlint.config.js`
```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
```
