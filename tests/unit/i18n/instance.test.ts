import { describe, expect, it } from "vitest";

import { createI18n } from "~/i18n/instance";
import { resourcesFor } from "~/i18n/resources.server";

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
