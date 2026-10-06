import { describe, expect, it } from "vitest";

import { HIGHLIGHT_LANGUAGES, highlightCodeBlocks } from "~/content/highlight.server";

/** 코드 블록 문법 강조(FR-083, research.md R24) */
describe("highlightCodeBlocks", () => {
  it("등록 언어(language-java)는 hljs- span으로 바꾼다", () => {
    const html =
      '<p>예제</p><pre><code class="language-java">public class A { String s = &#34;x&lt;y&#34;; }\n</code></pre>';

    const result = highlightCodeBlocks(html);

    expect(result).toContain('<p>예제</p><pre><code class="language-java hljs">');
    expect(result).toContain('<span class="hljs-keyword">public</span>');
    expect(result).toContain('<span class="hljs-string">&quot;x&lt;y&quot;</span>');
    expect(result).not.toContain("<y");
  });

  it("별칭(js, ts, html, sh, yml, py, kt)도 등록 언어로 본다", () => {
    for (const alias of ["js", "ts", "html", "sh", "yml", "py", "kt"]) {
      const result = highlightCodeBlocks(
        `<pre><code class="language-${alias}">const a = 1;</code></pre>`,
      );
      expect(result, alias).toContain(`class="language-${alias} hljs"`);
    }
  });

  it("backend 살균기가 인코딩한 언어 이름(language-c&#43;&#43;)도 풀어서 알아본다", () => {
    // OWASP 살균기는 속성 값의 +를 &#43;로 바꾼다(실제 backend 출력).
    const html = '<pre><code class="language-c&#43;&#43;">int a&lt;b;\n</code></pre>';

    const result = highlightCodeBlocks(html);

    expect(result).toContain('<pre><code class="language-c&#43;&#43; hljs">');
    expect(result).toContain('<span class="hljs-type">int</span>');
    expect(result).not.toContain("a<b");
  });

  it("c#·cs·c 펜스도 강조한다", () => {
    for (const alias of ["c#", "cs", "c", "cpp"]) {
      const result = highlightCodeBlocks(
        `<pre><code class="language-${alias}">int x = 1;</code></pre>`,
      );
      expect(result, alias).toContain(`class="language-${alias} hljs"`);
      expect(result, alias).toContain("hljs-");
    }
  });

  it("풀어 낸 언어 이름이 허용 형식이 아니면 그대로 둔다", () => {
    const html = '<pre><code class="language-&#34;java">int x;</code></pre>';

    expect(highlightCodeBlocks(html)).toBe(html);
  });

  it("언어를 지정하지 않은 블록은 그대로 둔다(자동 감지 없음)", () => {
    const html = "<pre><code>public class A {}\nSELECT * FROM t;</code></pre>";

    expect(highlightCodeBlocks(html)).toBe(html);
  });

  it("등록하지 않은 언어는 그대로 둔다", () => {
    const html = '<pre><code class="language-cobol">DISPLAY &#39;HI&#39;.</code></pre>';

    expect(highlightCodeBlocks(html)).toBe(html);
  });

  it("코드 안의 HTML은 다시 이스케이프되어 태그가 되지 않는다", () => {
    const html =
      '<pre><code class="language-html">&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>';

    const result = highlightCodeBlocks(html);

    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;");
    expect(result).toContain("hljs-tag");
  });

  it("여러 블록을 각각 강조하고, 코드 밖의 본문은 건드리지 않는다", () => {
    const html =
      '<h2>제목</h2><pre><code class="language-sql">SELECT 1;</code></pre>' +
      '<p>중간 <code>inline</code></p><pre><code class="language-bash">echo hi</code></pre>';

    const result = highlightCodeBlocks(html);

    expect(result.match(/ hljs"/g)).toHaveLength(2);
    expect(result).toContain("<h2>제목</h2>");
    expect(result).toContain("<p>중간 <code>inline</code></p>");
    expect(result).toContain('<span class="hljs-keyword">SELECT</span>');
  });

  it("빈 본문·null도 받는다", () => {
    expect(highlightCodeBlocks("")).toBe("");
    expect(highlightCodeBlocks(null)).toBe("");
  });

  it("R24의 언어를 모두 등록했다", () => {
    expect(HIGHLIGHT_LANGUAGES).toEqual(
      expect.arrayContaining([
        "java",
        "kotlin",
        "javascript",
        "typescript",
        "json",
        "xml",
        "css",
        "sql",
        "bash",
        "yaml",
        "python",
        "go",
        "diff",
        "c",
        "cpp",
        "csharp",
      ]),
    );
  });
});
