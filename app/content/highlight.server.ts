import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/**
 * 코드 블록 문법 강조(FR-083, research.md R24). 서버에서만 실행하고, 브라우저에는 강조된 HTML과 테마 CSS만 간다.
 * backend가 살균한 본문의 `<pre><code class="language-xxx">`만 바꾼다. 언어 자동 감지는 하지 않는다.
 */
const LANGUAGES = {
  java,
  kotlin,
  javascript,
  typescript,
  json,
  xml,
  css,
  sql,
  bash,
  yaml,
  python,
  go,
  diff,
  c,
  cpp,
  csharp,
};

for (const [name, language] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, language);
}

/** 등록한 언어. 펜스에는 별칭(js, ts, html, sh, yml, py, kt, c++, c#, cs 등)도 쓸 수 있다. */
export const HIGHLIGHT_LANGUAGES = Object.keys(LANGUAGES);

/**
 * 살균 정책이 남기는 형식 그대로(R8): 코드 안에는 태그가 없고 `<`는 이스케이프되어 있다.
 * class 값은 살균기가 인코딩한 채로 온다(`language-c++` → `language-c&#43;&#43;`). 풀어서 언어 이름을 읽는다.
 */
const CODE_BLOCK = /<pre><code class="language-([^"<>]+)">([^<]*)<\/code><\/pre>/g;
/** 살균 정책이 허용하는 언어 이름(R8) */
const LANGUAGE_NAME = /^[a-z0-9+#-]+$/;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) || code > 0x10ffff ? entity : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

export function highlightCodeBlocks(html: string | null | undefined): string {
  if (!html) {
    return "";
  }
  return html.replace(CODE_BLOCK, (block, encodedLanguage: string, escapedCode: string) => {
    const language = decodeEntities(encodedLanguage);
    if (!LANGUAGE_NAME.test(language) || !hljs.getLanguage(language)) {
      return block;
    }
    // highlight.js는 코드 내용을 다시 이스케이프하고 `<span class="hljs-*">`만 만든다.
    const { value } = hljs.highlight(decodeEntities(escapedCode), {
      language,
      ignoreIllegals: true,
    });
    // class 값은 받은(인코딩된) 그대로 다시 쓴다.
    return `<pre><code class="language-${encodedLanguage} hljs">${value}</code></pre>`;
  });
}
