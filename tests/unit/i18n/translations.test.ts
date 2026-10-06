import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { BASE_LANGUAGE, DEFAULT_NAMESPACE, SUPPORTED_LANGUAGES } from "~/i18n/config";

/**
 * 번역 누락 점검(FR-152, SC-024, 헌법 원칙 VII).
 * 기준 언어(ko)의 모든 네임스페이스·키가 4개 언어에 빠짐없이, 빈 값 없이 있어야 한다.
 */
const ROOT = join(import.meta.dirname, "../../..");
const LOCALES_DIR = join(ROOT, "app/locales");

type Messages = { [key: string]: string | Messages };

function readNamespaces(language: string): Record<string, Messages> {
  const dir = join(LOCALES_DIR, language);
  return Object.fromEntries(
    readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => [
        file.replace(/\.json$/, ""),
        JSON.parse(readFileSync(join(dir, file), "utf-8")),
      ]),
  );
}

function flatten(messages: Messages, prefix = ""): Map<string, unknown> {
  const result = new Map<string, unknown>();
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const [k, v] of flatten(value, path)) result.set(k, v);
    } else {
      result.set(path, value);
    }
  }
  return result;
}

function placeholders(value: unknown): string[] {
  return [...String(value).matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]).sort();
}

/**
 * 번역하지 않고 다른 언어 문구를 복사해 둔 경우를 찾는다(SC-024). 한국어(기준 언어)는 검사하지 않는다.
 * en: 한글·가나·한자, ja: 한글, zh-CN: 한글·가나
 */
const FOREIGN_SCRIPTS: Partial<Record<string, RegExp>> = {
  en: /[\uac00-\ud7a3\u3040-\u30ff\u4e00-\u9fff]/,
  ja: /[\uac00-\ud7a3]/,
  "zh-CN": /[\uac00-\ud7a3\u3040-\u30ff]/,
};

const locales = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((language) => [language, readNamespaces(language)]),
);
const base = locales[BASE_LANGUAGE];

describe("번역 파일", () => {
  it("4개 언어 폴더가 모두 있다", () => {
    expect(readdirSync(LOCALES_DIR).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  it("기준 언어에 네임스페이스가 있다", () => {
    expect(Object.keys(base)).toContain(DEFAULT_NAMESPACE);
    expect(Object.keys(base)).toContain("errors");
  });

  describe.each(SUPPORTED_LANGUAGES)("%s", (language) => {
    const target = locales[language];

    it("기준 언어와 네임스페이스가 같다", () => {
      expect(Object.keys(target).sort()).toEqual(Object.keys(base).sort());
    });

    it.each(Object.keys(base))("%s: 키가 빠지거나 남지 않고, 값이 비어 있지 않다", (namespace) => {
      const baseKeys = flatten(base[namespace]);
      const targetKeys = flatten(target[namespace] ?? {});

      const missing = [...baseKeys.keys()].filter((key) => !targetKeys.has(key));
      const extra = [...targetKeys.keys()].filter((key) => !baseKeys.has(key));
      const empty = [...targetKeys]
        .filter(([, v]) => typeof v !== "string" || v.trim() === "")
        .map(([k]) => k);

      expect({ missing, extra, empty }).toEqual({ missing: [], extra: [], empty: [] });
    });

    it.each(Object.keys(base))("%s: 다른 언어 문구를 그대로 옮겨 두지 않았다", (namespace) => {
      const foreign = FOREIGN_SCRIPTS[language];
      const copied = [...flatten(target[namespace] ?? {})]
        .filter(([, value]) => foreign && foreign.test(String(value)))
        .map(([key]) => key);

      expect(copied).toEqual([]);
    });

    it.each(Object.keys(base))("%s: 문구의 {{변수}}가 기준 언어와 같다", (namespace) => {
      const targetKeys = flatten(target[namespace] ?? {});
      const mismatched = [...flatten(base[namespace])]
        .filter(([key]) => targetKeys.has(key))
        .filter(
          ([key, value]) => placeholders(value).join() !== placeholders(targetKeys.get(key)).join(),
        )
        .map(([key]) => key);

      expect(mismatched).toEqual([]);
    });
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "locales" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("소스에서 쓰는 키", () => {
  // t("key"), t("ns:key") 처럼 문자열 그대로 쓴 키만 찾는다. 템플릿 문자열(`errors:${code}`)은 errors.test에서 본다.
  const used = sourceFiles(join(ROOT, "app")).flatMap((file) =>
    [...readFileSync(file, "utf-8").matchAll(/\bt\(\s*["']([^"'`]+)["']/g)].map((m) => ({
      file: relative(ROOT, file),
      key: m[1],
    })),
  );

  it("소스에서 키를 찾았다", () => {
    expect(used.length).toBeGreaterThan(0);
  });

  it("모든 키가 기준 언어(ko)에 있다", () => {
    const missing = used.filter(({ key }) => {
      const [namespace, path] = key.includes(":") ? key.split(":", 2) : [DEFAULT_NAMESPACE, key];
      return !base[namespace] || !flatten(base[namespace]).has(path);
    });
    expect(missing).toEqual([]);
  });
});
