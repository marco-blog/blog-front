import { join } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * sanitize된 본문(contentHtml) 표시 파일만 dangerouslySetInnerHTML을 쓸 수 있다(research.md R27, 003 contracts/routes.md).
 */
const ROOT = join(import.meta.dirname, "../../..");
const RULE = "react-dom/no-dangerously-set-innerhtml";
const CODE = `export function X({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
`;

async function ruleIds(file: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: ROOT });
  const [result] = await eslint.lintText(CODE, { filePath: join(ROOT, file) });
  return result.messages.map((message) => message.ruleId ?? message.message);
}

describe("dangerouslySetInnerHTML 예외 목록", () => {
  it("일반 컴포넌트에서는 오류", { timeout: 30_000 }, async () => {
    expect(await ruleIds("app/components/Other.tsx")).toEqual([RULE]);
    expect(await ruleIds("app/routes/post.tsx")).toEqual([RULE]);
  });

  it("app/components/post/PostContent.tsx만 허용", { timeout: 30_000 }, async () => {
    expect(await ruleIds("app/components/post/PostContent.tsx")).toEqual([]);
  });

  it(
    "003 릴리스 노트 본문 두 파일도 허용, 같은 폴더의 다른 파일은 오류(T116)",
    { timeout: 30_000 },
    async () => {
      expect(await ruleIds("app/routes/updates/version.tsx")).toEqual([]);
      expect(await ruleIds("app/routes/updates/revision.tsx")).toEqual([]);
      expect(await ruleIds("app/routes/updates/index.tsx")).toEqual([RULE]);
      expect(await ruleIds("app/routes/updates/history.tsx")).toEqual([RULE]);
    },
  );

  it(
    "006 릴리스 노트 미리보기 컴포넌트도 허용, 같은 폴더의 다른 파일은 오류(T058)",
    { timeout: 30_000 },
    async () => {
      expect(await ruleIds("app/components/admin/MarkdownPreview.tsx")).toEqual([]);
      expect(await ruleIds("app/components/admin/ReleaseNoteEditor.tsx")).toEqual([RULE]);
    },
  );
});
