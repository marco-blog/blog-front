import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactDom from "eslint-plugin-react-dom";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/** dangerouslySetInnerHTML을 쓸 수 있는 유일한 파일: backend가 sanitize한 글 본문 표시(R27) */
const SANITIZED_HTML_FILES = [
  "app/components/post/PostContent.tsx",
  // 003 릴리스 노트 본문(backend가 살균, 제목 id 허용). 003 contracts/routes.md
  "app/routes/updates/version.tsx",
  "app/routes/updates/revision.tsx",
  // 005 TrackBack 자동 발견 RDF(HTML 주석). 사용자 입력이 아니라 모든 값을 rdfEscape로 이스케이프해 만든 문자열이다.
  // React는 주석을 그릴 수 없다. 005 contracts/routes.md 글 상세
  "app/components/trackback/TrackbackRdf.tsx",
  // 006 릴리스 노트 편집기 미리보기(backend `POST /admin/release-notes/preview`가 같은 규칙으로 살균). 006 contracts/routes.md
  "app/components/admin/MarkdownPreview.tsx",
];

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
    },
  },
  {
    // sanitize된 본문(contentHtml) 외에는 HTML을 직접 넣지 않는다(research.md R27).
    // 예외는 살균한 본문 표시 파일(SANITIZED_HTML_FILES)뿐이다. 늘리려면 R27을 먼저 고친다.
    plugins: { "react-dom": reactDom },
    rules: {
      "react-dom/no-dangerously-set-innerhtml": "error",
    },
  },
  {
    files: SANITIZED_HTML_FILES,
    rules: {
      "react-dom/no-dangerously-set-innerhtml": "off",
    },
  },
  prettier,
);
