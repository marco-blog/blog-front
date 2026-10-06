import { describe, expect, it } from "vitest";

import { SUPPORTED_LANGUAGES } from "~/i18n/config";
import { errorMessage, fieldErrorMessage, fieldErrorMessages } from "~/api/errorMessage";
import { ApiError, toApiErrorData } from "~/api/errors";
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

describe("화면에 키나 resultMessage가 나오지 않는다 (FR-154)", () => {
  const error = new ApiError({
    status: 400,
    resultCode: "VALIDATION_FAILED",
    resultMessage: "Validation failed: title must not be blank",
    fieldErrors: [{ field: "title", code: "REQUIRED" }],
  });

  it("ApiError·직렬화한 오류 데이터도 resultCode로 번역한다", () => {
    expect(errorMessage(t("ko"), error)).toBe("입력한 내용을 확인해 주세요.");
    expect(errorMessage(t("en"), toApiErrorData(error))).toBe("Please check what you entered.");
    expect(errorMessage(t("en"), null)).toBe(
      (allResources.en.errors as Record<string, string>).UNKNOWN,
    );
  });

  it.each(SUPPORTED_LANGUAGES)("%s: 공통 오류 코드는 모두 번역돼 있다", (language) => {
    for (const code of [
      "VALIDATION_FAILED",
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "ORIGIN_NOT_ALLOWED",
      "NOT_FOUND",
      "INTERNAL_ERROR",
      "UNKNOWN",
    ]) {
      const message = errorMessage(t(language), code);
      expect(message).toBe((allResources[language].errors as Record<string, string>)[code]);
      expect(message).not.toContain(code);
      expect(message).not.toContain("errors:");
    }
  });

  it.each(SUPPORTED_LANGUAGES)(
    "%s: 어떤 입력에도 키·영어 디버그 문구가 나오지 않는다",
    (language) => {
      const messages = [
        errorMessage(t(language), error),
        errorMessage(t(language), "NEW_BACKEND_CODE"),
        fieldErrorMessage(t(language), { code: "NEW_FIELD_RULE" }),
        ...Object.values(fieldErrorMessages(t(language), error.fieldErrors)),
      ];
      for (const message of messages) {
        expect(message).not.toMatch(/errors:|fieldErrors\.|NEW_/);
        expect(message).not.toContain(error.resultMessage);
      }
    },
  );
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
