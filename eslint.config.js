import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "build/",
      "coverage/",
      "node_modules/",
      ".react-router/",
      "playwright-report/",
      "test-results/",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // sanitize된 본문(contentHtml) 외에는 HTML을 직접 넣지 않는다(research.md R27).
      // 본문 표시 컴포넌트를 만들 때 그 파일만 예외로 둔다.
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            "dangerouslySetInnerHTML은 sanitize된 본문 표시 컴포넌트에서만 쓴다(research.md R27).",
        },
      ],
    },
  },
  prettier,
);
