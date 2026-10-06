import { join } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * sanitize된 본문(contentHtml) 표시 컴포넌트 한 파일만 dangerouslySetInnerHTML을 쓸 수 있다(research.md R27).
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
});
