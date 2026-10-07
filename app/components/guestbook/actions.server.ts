import { data, redirect } from "react-router";

import { createApiClient } from "~/api/client.server";
import { isApiError } from "~/api/errors";
import { VALIDATION_FAILED, toFormError } from "~/api/formErrors";
import { GUESTBOOK_MAX_LENGTH, type GuestbookEntry, type GuestbookWrite } from "~/api/models";
import type { ApiFieldError } from "~/api/types";
import { loginPath } from "~/auth/paths";
import { guestFieldErrors, guestPasswordErrors } from "~/blog/guestAuthor";
import { parsePostId } from "~/blog/ids";

import { GUESTBOOK_INTENTS, type GuestbookActionData, type GuestbookIntent } from "./actions";

const TARGET_PATTERN = /^(new|(reply|edit|delete|unlock)-\d{1,16})$/;

export interface GuestbookActionOptions {
  handle: string;
  /** 받을 작업(관리 화면은 reply·delete만) */
  intents?: readonly GuestbookIntent[];
  /** 성공 뒤 갈 주소(같은 쪽) */
  returnTo: string;
  /** 새 글을 쓴 뒤 갈 주소(첫 쪽). 없으면 returnTo */
  createdTo?: string;
}

/** 내용 미리 검사(backend와 같은 규칙: 앞뒤 공백을 뺀 1~1000자) */
export function guestbookContentErrors(content: string): ApiFieldError[] {
  if (content.trim() === "") {
    return [{ field: "content", code: "REQUIRED" }];
  }
  if (content.length > GUESTBOOK_MAX_LENGTH) {
    return [{ field: "content", code: "TOO_LONG", params: { max: GUESTBOOK_MAX_LENGTH } }];
  }
  return [];
}

/**
 * 방명록 작업(004 FR-056~058, FR-066): `intent=create|reply|update|delete|unlock`.
 * 비회원 글은 이름·비밀번호(쓰기), 비밀번호(고치기·지우기·내용 보기)를 함께 보낸다. 폼에 `guestName` 칸이 있으면 비회원 쓰기다.
 * 성공하면 같은 쪽으로 리다이렉트(새 글은 첫 쪽), 로그인이 필요하면(401) 로그인 화면으로.
 */
export async function runGuestbookAction(request: Request, options: GuestbookActionOptions) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const targetValue = String(form.get("target") ?? "");
  const target = TARGET_PATTERN.test(targetValue) ? targetValue : "new";
  const allowed = options.intents ?? GUESTBOOK_INTENTS;
  const failure = (fieldErrors: ApiFieldError[] = []) =>
    data<GuestbookActionData>(
      { intent, target, ok: false, resultCode: VALIDATION_FAILED, field: null, fieldErrors },
      { status: 400 },
    );
  if (!(allowed as readonly string[]).includes(intent)) {
    return failure();
  }

  const content = String(form.get("content") ?? "");
  const secret = form.get("secret") === "on";
  const guestPassword = String(form.get("guestPassword") ?? "");
  const hasGuestPassword = form.has("guestPassword");
  const entryId = parsePostId(String(form.get("entryId") ?? ""));
  const parentId = parsePostId(String(form.get("parentId") ?? ""));
  const api = createApiClient(request);
  try {
    if (intent === "create") {
      const isGuest = form.has("guestName");
      const guestName = String(form.get("guestName") ?? "").trim();
      const errors = [
        ...guestbookContentErrors(content),
        ...(isGuest ? guestFieldErrors(guestName, guestPassword) : []),
      ];
      if (errors.length > 0) {
        return failure(errors);
      }
      const body: GuestbookWrite = {
        content,
        secret,
        ...(isGuest ? { guestName, guestPassword } : {}),
      };
      await api.post(`/blogs/${options.handle}/guestbook`, { body });
      throw redirect(options.createdTo ?? options.returnTo);
    }
    if (intent === "reply") {
      if (parentId === null) {
        return failure();
      }
      const errors = guestbookContentErrors(content);
      if (errors.length > 0) {
        return failure(errors);
      }
      await api.post(`/blogs/${options.handle}/guestbook`, {
        body: { content, parentId } satisfies GuestbookWrite,
      });
      throw redirect(options.returnTo);
    }
    if (entryId === null) {
      return failure();
    }
    if (intent === "update") {
      const errors = [
        ...guestbookContentErrors(content),
        ...(hasGuestPassword ? guestPasswordErrors(guestPassword) : []),
      ];
      if (errors.length > 0) {
        return failure(errors);
      }
      await api.patch(`/guestbook-entries/${entryId}`, {
        body: { content, secret, ...(hasGuestPassword ? { guestPassword } : {}) },
      });
      throw redirect(options.returnTo);
    }
    if (intent === "delete") {
      if (hasGuestPassword && guestPassword === "") {
        return failure([{ field: "guestPassword", code: "REQUIRED" }]);
      }
      await api.delete(`/guestbook-entries/${entryId}`, {
        ...(hasGuestPassword ? { body: { guestPassword } } : {}),
      });
      throw redirect(options.returnTo);
    }
    const errors = guestPasswordErrors(guestPassword);
    if (errors.length > 0) {
      return failure(errors);
    }
    const entry = await api.post<GuestbookEntry>(`/guestbook-entries/${entryId}/unlock`, {
      body: { guestPassword },
    });
    return data<GuestbookActionData>({ intent: "unlock", target, ok: true, entry });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    if (isApiError(error) && error.status === 401) {
      throw redirect(loginPath(options.returnTo));
    }
    const { data: formError, status } = toFormError(error, {
      GUEST_PASSWORD_MISMATCH: "guestPassword",
    });
    return data<GuestbookActionData>({ ...formError, intent, target, ok: false }, { status });
  }
}
