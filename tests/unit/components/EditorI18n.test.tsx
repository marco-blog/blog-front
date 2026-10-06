import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { crepeConfig } from "~/components/Editor/Editor";
import { SUPPORTED_LANGUAGES } from "~/i18n/config";

import { testI18n } from "../support/render";

/**
 * 에디터 문구(T229, FR-148): Crepe의 메뉴·툴바·플레이스홀더 등 화면에 보이는 문구는 모두
 * 화면 언어의 editor(이미지 문구는 media) 네임스페이스 번역이고, Crepe의 영어 기본 문구나 키 이름이 남지 않는다.
 */
const LOCALES_DIR = join(import.meta.dirname, "../../../app/locales");

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

function translations(language: string): Set<string> {
  return new Set(
    ["editor", "media"].flatMap((namespace) =>
      strings(
        JSON.parse(readFileSync(join(LOCALES_DIR, language, `${namespace}.json`), "utf-8")) as Json,
      ),
    ),
  );
}

/** Crepe가 문구 설정을 받지 못했을 때 쓰는 영어 기본 문구(7.x) */
const CREPE_DEFAULTS = [
  "Text",
  "Quote",
  "Divider",
  "List",
  "Advanced",
  "Image",
  "Code",
  "Table",
  "Search language",
  "No result",
  "Copy",
  "Paste link...",
  "Confirm",
  "Hide",
];

const upload = async () => "/media/x";

describe.each(SUPPORTED_LANGUAGES)("%s", (language) => {
  const { t } = testI18n(language);
  const config = crepeConfig(t, {} as HTMLElement, "", upload);
  const { featureConfigs } = config;
  const toggle = featureConfigs["code-mirror"].previewToggleText;
  const shown = [
    ...strings(featureConfigs).filter((text) => text !== "doc"),
    toggle(true),
    toggle(false),
  ];
  const expected = translations(language);

  it("화면에 보이는 문구가 모두 그 언어의 번역이다", () => {
    expect(shown.length).toBeGreaterThan(25);
    expect(shown.filter((text) => !expected.has(text))).toEqual([]);
  });

  it("키 이름이 나오지 않는다", () => {
    expect(shown.filter((text) => /^(editor|media):/.test(text))).toEqual([]);
  });

  if (language !== "en") {
    it("Crepe의 영어 기본 문구가 남지 않는다", () => {
      expect(shown.filter((text) => CREPE_DEFAULTS.includes(text))).toEqual([]);
    });
  }

  it("플레이스홀더와 / 메뉴 제목", () => {
    expect(featureConfigs.placeholder.text).toBe(t("editor:placeholder"));
    expect(featureConfigs["block-edit"].textGroup.label).toBe(t("editor:menu.text"));
    expect(toggle(true)).toBe(t("editor:code.previewEdit"));
    expect(toggle(false)).toBe(t("editor:code.previewHide"));
  });
});

describe("언어마다 다른 문구", () => {
  it("플레이스홀더가 4개 언어에서 모두 다르다", () => {
    const placeholders = SUPPORTED_LANGUAGES.map(
      (language) =>
        crepeConfig(testI18n(language).t, {} as HTMLElement, "").featureConfigs.placeholder.text,
    );
    expect(new Set(placeholders).size).toBe(4);
  });
});
