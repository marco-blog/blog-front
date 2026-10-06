import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { API_ERROR_CODES, ERROR_CODES, FIELD_ERROR_CODES } from "~/api/errorCodes";
import { errorMessage, fieldErrorMessage } from "~/api/errorMessage";
import { SUPPORTED_LANGUAGES } from "~/i18n/config";

import { testI18n } from "../support/render";

/**
 * 오류 문구(T227, FR-154, quickstart #28): contracts/api.md 오류 코드 표의 001 코드(`app/api/errorCodes.ts`)와
 * 입력 검증 코드가 4개 언어 errors.json에 모두 있고, 화면에는 코드 대신 그 언어 문구가 나온다.
 */
const LOCALES_DIR = join(import.meta.dirname, "../../../app/locales");

type ErrorMessages = Record<string, string> & { fieldErrors: Record<string, string> };

const errors = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((language) => [
    language,
    JSON.parse(readFileSync(join(LOCALES_DIR, language, "errors.json"), "utf-8")) as ErrorMessages,
  ]),
);

/** contracts/api.md "오류 코드" 표의 001 코드(003·006 전용 RELEASE_NOTE_* 제외) */
const CONTRACT_001_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "REFRESH_INVALID",
  "FORBIDDEN",
  "ORIGIN_NOT_ALLOWED",
  "BLOG_NOT_FOUND",
  "POST_NOT_FOUND",
  "DRAFT_NOT_FOUND",
  "CATEGORY_NOT_FOUND",
  "COMMENT_NOT_FOUND",
  "MEDIA_NOT_FOUND",
  "NOT_FOUND",
  "THUMBNAIL_SIZE_NOT_ALLOWED",
  "PASSWORD_RESET_TOKEN_INVALID",
  "CURRENT_PASSWORD_MISMATCH",
  "EMAIL_TAKEN",
  "HANDLE_TAKEN",
  "CATEGORY_NAME_TAKEN",
  "BLOG_LIMIT_EXCEEDED",
  "LAST_BLOG_CANNOT_BE_DELETED",
  "MEDIA_TOO_LARGE",
  "MEDIA_TYPE_NOT_ALLOWED",
  "HANDLE_RESERVED",
  "HANDLE_INVALID",
  "TAG_LIMIT_EXCEEDED",
  "CATEGORY_DEPTH_EXCEEDED",
  "REPLY_DEPTH_EXCEEDED",
  "COMMENTS_DISABLED",
  "POST_NOT_IN_TRASH",
  "POST_CONTENT_EMPTY",
  "TERMS_VERSION_OUTDATED",
  "POST_NOT_PUBLISHED",
  "ACCOUNT_LOCKED",
  "MEDIA_TEMP_QUOTA_EXCEEDED",
];

describe("오류 코드 목록", () => {
  it("contracts/api.md 오류 코드 표의 001 코드를 모두 담는다", () => {
    expect(
      CONTRACT_001_CODES.filter((code) => !(API_ERROR_CODES as readonly string[]).includes(code)),
    ).toEqual([]);
  });

  it("코드가 겹치지 않는다", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    expect(new Set(FIELD_ERROR_CODES).size).toBe(FIELD_ERROR_CODES.length);
  });
});

describe.each(SUPPORTED_LANGUAGES)("%s errors.json", (language) => {
  const messages = errors[language];

  it("모든 오류 코드의 문구가 있다", () => {
    expect(
      ERROR_CODES.filter((code) => typeof messages[code] !== "string" || !messages[code].trim()),
    ).toEqual([]);
  });

  it("모든 입력 검증 코드의 문구가 있다", () => {
    expect(FIELD_ERROR_CODES.filter((code) => !messages.fieldErrors?.[code]?.trim())).toEqual([]);
  });

  it("목록에 없는 코드의 문구가 남아 있지 않다", () => {
    const listed = new Set<string>([...ERROR_CODES, "fieldErrors"]);
    expect(Object.keys(messages).filter((key) => !listed.has(key))).toEqual([]);
    expect(
      Object.keys(messages.fieldErrors).filter(
        (key) => !(FIELD_ERROR_CODES as readonly string[]).includes(key),
      ),
    ).toEqual([]);
  });

  it("화면에는 코드가 아니라 그 언어 문구가 나온다", () => {
    const { t } = testI18n(language);
    for (const code of ERROR_CODES) {
      const message = errorMessage(t, code);
      expect(message).toBe(messages[code]);
      expect(message).not.toContain(code);
    }
    for (const code of FIELD_ERROR_CODES) {
      expect(fieldErrorMessage(t, { code, params: { max: 10, min: 2 } })).not.toContain(code);
    }
  });
});

describe("언어별 로그인 실패 문구(quickstart #28)", () => {
  it("4개 언어가 서로 다른 문구다", () => {
    const messages = SUPPORTED_LANGUAGES.map((language) =>
      errorMessage(testI18n(language).t, "INVALID_CREDENTIALS"),
    );
    expect(new Set(messages).size).toBe(4);
  });
});
