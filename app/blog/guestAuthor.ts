import type { ApiFieldError } from "~/api/types";
import {
  GUEST_NAME_MAX,
  GUEST_PASSWORD_MAX,
  GUEST_PASSWORD_MIN,
  type CommentAuthor,
} from "~/api/models";

/**
 * 댓글·방명록 쓰기 폼을 누구에게 어떻게 보여줄지(004 FR-066).
 * - `member`: 로그인 회원(내용만)
 * - `guest`: 비로그인 + 블로그가 비회원 쓰기를 허용(이름·비밀번호 칸 추가)
 * - `login`: 비로그인 + 허용하지 않음(로그인 안내)
 */
export type WriterMode = "member" | "guest" | "login";

export function writerMode(
  viewer: { userId: number } | null | undefined,
  guestWriteEnabled: boolean | undefined,
): WriterMode {
  if (viewer) {
    return "member";
  }
  return guestWriteEnabled ? "guest" : "login";
}

/** 비회원 작성자인지(응답의 `author.guest`) */
export function isGuestAuthor(author: CommentAuthor | null | undefined): boolean {
  return author?.guest === true;
}

/** 로그인 회원 본인이 쓴 글인지(비회원 글은 회원 본인일 수 없다) */
export function isOwnEntry(
  author: CommentAuthor | null | undefined,
  viewerId: number | null,
): boolean {
  return viewerId !== null && !isGuestAuthor(author) && author?.userId === viewerId;
}

/** 비회원 이름·비밀번호 미리 검사(backend와 같은 규칙: 이름 1~30자, 비밀번호 4~64자) */
export function guestFieldErrors(name: string, password: string): ApiFieldError[] {
  const errors: ApiFieldError[] = [];
  if (name.trim() === "") {
    errors.push({ field: "guestName", code: "REQUIRED" });
  } else if (name.trim().length > GUEST_NAME_MAX) {
    errors.push({ field: "guestName", code: "TOO_LONG", params: { max: GUEST_NAME_MAX } });
  }
  errors.push(...guestPasswordErrors(password));
  return errors;
}

/** 비회원 글 비밀번호 미리 검사 */
export function guestPasswordErrors(password: string): ApiFieldError[] {
  if (password === "") {
    return [{ field: "guestPassword", code: "REQUIRED" }];
  }
  if (password.length < GUEST_PASSWORD_MIN) {
    return [{ field: "guestPassword", code: "TOO_SHORT", params: { min: GUEST_PASSWORD_MIN } }];
  }
  if (password.length > GUEST_PASSWORD_MAX) {
    return [{ field: "guestPassword", code: "TOO_LONG", params: { max: GUEST_PASSWORD_MAX } }];
  }
  return [];
}
