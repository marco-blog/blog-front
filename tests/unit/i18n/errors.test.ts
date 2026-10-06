import { describe, expect, it } from "vitest";

import { SUPPORTED_LANGUAGES } from "~/i18n/config";
import { errorMessage, fieldErrorMessage, fieldErrorMessages } from "~/i18n/errors";
import { createI18n } from "~/i18n/instance";
import { allResources, resourcesFor } from "~/i18n/resources.server";

const t = (language: (typeof SUPPORTED_LANGUAGES)[number]) =>
  createI18n(language, resourcesFor(language)).t;

describe("errorMessage (FR-154)", () => {
  it("코드별 문구를 화면 언어로 보여준다", () => {
    expect(errorMessage(t("ko"), "UNAUTHENTICATED")).toBe("로그인이 필요합니다.");
    expect(errorMessage(t("ja"), "NOT_FOUND")).toBe("お探しの内容が見つかりません。");
  });

  it.each(SUPPORTED_LANGUAGES)("%s: 모르는 코드는 일반 오류 문구", (language) => {
    const expected = (allResources[language].errors as Record<string, string>).UNKNOWN;
    expect(errorMessage(t(language), "SOMETHING_NEW")).toBe(expected);
    expect(errorMessage(t(language), "fieldErrors")).toBe(expected);
    expect(errorMessage(t(language), "a:b.c")).toBe(expected);
    expect(errorMessage(t(language), undefined)).toBe(expected);
  });
});

describe("fieldErrorMessage", () => {
  it("params를 문구에 넣는다", () => {
    expect(fieldErrorMessage(t("ko"), { code: "TOO_LONG", params: { max: 20 } })).toBe(
      "20자 이하로 입력해 주세요.",
    );
    expect(fieldErrorMessage(t("en"), { code: "TOO_SHORT", params: { min: 3 } })).toBe(
      "Enter at least 3 characters.",
    );
  });

  it("모르는 코드는 INVALID 문구", () => {
    expect(fieldErrorMessage(t("zh-CN"), { code: "NEW_RULE" })).toBe("该值无效。");
    expect(fieldErrorMessage(t("zh-CN"), { code: "bad.code" })).toBe("该值无效。");
  });

  it("필드별 첫 오류만 모은다", () => {
    expect(
      fieldErrorMessages(t("en"), [
        { field: "title", code: "REQUIRED" },
        { field: "title", code: "TOO_LONG", params: { max: 200 } },
        { field: "handle", code: "INVALID_FORMAT" },
      ]),
    ).toEqual({ title: "This field is required.", handle: "The format is not valid." });
    expect(fieldErrorMessages(t("en"), undefined)).toEqual({});
  });
});

describe("대체 언어 (FR-152)", () => {
  it("화면 언어에 없는 키는 영어, 영어도 없으면 한국어", () => {
    const i18n = createI18n("ja", {
      ja: { common: { a: "ja-a" } },
      en: { common: { a: "en-a", b: "en-b" } },
      ko: { common: { a: "ko-a", b: "ko-b", c: "ko-c" } },
    });
    expect([i18n.t("a"), i18n.t("b"), i18n.t("c")]).toEqual(["ja-a", "en-b", "ko-c"]);
  });

  it("빈 문자열은 번역이 없는 것으로 본다", () => {
    const i18n = createI18n("ja", { ja: { common: { a: "" } }, en: { common: { a: "en-a" } } });
    expect(i18n.t("a")).toBe("en-a");
  });

  it("resourcesFor는 화면 언어와 대체 언어만 담는다", () => {
    expect(Object.keys(resourcesFor("ja")).sort()).toEqual(["en", "ja", "ko"]);
    expect(Object.keys(resourcesFor("ko")).sort()).toEqual(["en", "ko"]);
  });
});
