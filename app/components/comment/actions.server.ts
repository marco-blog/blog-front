import { data, redirect } from "react-router";

import { createApiClient } from "~/api/client.server";
import { isApiError } from "~/api/errors";
import { VALIDATION_FAILED, toFormError } from "~/api/formErrors";
import { COMMENT_MAX_LENGTH, type Comment, type CommentWrite } from "~/api/models";
import type { ApiFieldError } from "~/api/types";
import { loginPath } from "~/auth/paths";
import { guestFieldErrors, guestPasswordErrors } from "~/blog/guestAuthor";
import { parsePostId } from "~/blog/ids";

import type { CommentActionData, CommentIntent } from "./actions";

const INTENTS: readonly CommentIntent[] = ["create", "edit", "delete", "unlockComment"];
const TARGET_PATTERN = /^(new|(reply|edit|delete|unlock)-\d{1,16})$/;

export interface CommentActionOptions {
  /** 댓글을 쓸 글(글 상세). 없으면 쓰기(create)는 받지 않는다(블로그 관리). */
  postId?: number;
  /** 로그인이 필요할 때 돌아올 주소 */
  returnTo: string;
}

/** 내용 미리 검사(backend와 같은 규칙: 앞뒤 공백을 뺀 1~1000자) */
export function contentErrors(content: string): ApiFieldError[] {
  if (content.trim() === "") {
    return [{ field: "content", code: "REQUIRED" }];
  }
  if (content.length > COMMENT_MAX_LENGTH) {
    return [{ field: "content", code: "TOO_LONG", params: { max: COMMENT_MAX_LENGTH } }];
  }
  return [];
}

/**
 * 댓글 작업 `action`(글 상세의 쓰기·답글·수정·삭제, 블로그 관리의 삭제). backend 댓글 API를 부르고
 * 결과를 폼에 돌려준다. 로그인이 풀렸으면(401) 로그인 화면으로 보낸다. 끝나면 loader가 댓글을 다시 읽는다.
 * 004: 비밀 댓글(`secret=on`), 비회원 쓰기(폼에 `guestName` 칸이 있으면 이름·비밀번호를 함께), 비회원 댓글의 수정·삭제는
 * `guestPassword`를 함께 보낸다. 비회원 비밀 댓글은 고치기 전에 `intent=unlockComment`로 내용을 받는다.
 */
export async function runCommentAction(request: Request, options: CommentActionOptions) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "") as CommentIntent;
  const targetValue = String(form.get("target") ?? "");
  const target = TARGET_PATTERN.test(targetValue) ? targetValue : "new";
  const failure = (fieldErrors: ApiFieldError[] = []) =>
    data<CommentActionData>(
      { intent, target, ok: false, resultCode: VALIDATION_FAILED, field: null, fieldErrors },
      { status: 400 },
    );
  if (!INTENTS.includes(intent)) {
    return failure();
  }

  const content = String(form.get("content") ?? "");
  const secret = form.get("secret") === "on";
  const guestPassword = String(form.get("guestPassword") ?? "");
  const hasGuestPassword = form.has("guestPassword");
  const commentId = parsePostId(String(form.get("commentId") ?? ""));
  const api = createApiClient(request);
  try {
    if (intent === "create") {
      const parentText = String(form.get("parentId") ?? "");
      const parentId = parentText === "" ? null : parsePostId(parentText);
      if (options.postId === undefined || (parentText !== "" && parentId === null)) {
        return failure();
      }
      const isGuest = form.has("guestName");
      const guestName = String(form.get("guestName") ?? "").trim();
      const errors = [
        ...contentErrors(content),
        ...(isGuest ? guestFieldErrors(guestName, guestPassword) : []),
      ];
      if (errors.length > 0) {
        return failure(errors);
      }
      await api.post(`/posts/${options.postId}/comments`, {
        body: {
          content,
          parentId,
          secret,
          ...(isGuest ? { guestName, guestPassword } : {}),
        } satisfies CommentWrite,
      });
    } else if (commentId === null) {
      return failure();
    } else if (intent === "edit") {
      const errors = [
        ...contentErrors(content),
        ...(hasGuestPassword ? guestPasswordErrors(guestPassword) : []),
      ];
      if (errors.length > 0) {
        return failure(errors);
      }
      await api.patch(`/comments/${commentId}`, {
        body: { content, secret, ...(hasGuestPassword ? { guestPassword } : {}) },
      });
    } else if (intent === "delete") {
      if (hasGuestPassword && guestPassword === "") {
        return failure([{ field: "guestPassword", code: "REQUIRED" }]);
      }
      await api.delete(`/comments/${commentId}`, {
        ...(hasGuestPassword ? { body: { guestPassword } } : {}),
      });
    } else {
      const errors = guestPasswordErrors(guestPassword);
      if (errors.length > 0) {
        return failure(errors);
      }
      const comment = await api.post<Comment>(`/comments/${commentId}/unlock`, {
        body: { guestPassword },
      });
      return data<CommentActionData>({ intent: "unlockComment", target, ok: true, comment });
    }
    return data<CommentActionData>({ intent, target, ok: true } as CommentActionData);
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      throw redirect(loginPath(options.returnTo));
    }
    const { data: formError, status } = toFormError(error, {
      GUEST_PASSWORD_MISMATCH: "guestPassword",
    });
    return data<CommentActionData>({ ...formError, intent, target, ok: false }, { status });
  }
}
