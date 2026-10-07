import { describe, expect, it } from "vitest";

import { runCommentAction } from "~/components/comment/actions.server";

import { fail, mockBackend, ok } from "../../support/backend";
import { asData, formRequest } from "../../support/route";

/** 댓글 action의 004 작업(T087): 비밀 댓글, 비회원 쓰기·수정·삭제, 비밀 댓글 내용 받기 */
const run = (fields: Record<string, string>) =>
  runCommentAction(formRequest("/marco/123", fields), { postId: 123, returnTo: "/marco/123" });

describe("runCommentAction(004)", () => {
  it("비회원 쓰기는 이름·비밀번호와 비밀 여부를 함께 보낸다", async () => {
    const backend = mockBackend({ "POST /api/v1/posts/123/comments": ok({ id: 1 }) });
    const result = asData(
      await run({
        intent: "create",
        target: "new",
        content: "안녕",
        secret: "on",
        guestName: " 나그네 ",
        guestPassword: "1234",
      }),
    );
    expect(result.data).toEqual({ intent: "create", target: "new", ok: true });
    expect(backend.calls[0].body).toEqual({
      content: "안녕",
      parentId: null,
      secret: true,
      guestName: "나그네",
      guestPassword: "1234",
    });
  });

  it("비회원 이름·비밀번호 미리 검사(backend를 부르지 않음)", async () => {
    const backend = mockBackend();
    const result = asData<{ fieldErrors: unknown[] }>(
      await run({ intent: "create", content: "안녕", guestName: "", guestPassword: "12" }),
    );
    expect(result.data.fieldErrors).toEqual([
      { field: "guestName", code: "REQUIRED" },
      { field: "guestPassword", code: "TOO_SHORT", params: { min: 4 } },
    ]);
    expect(backend.calls).toHaveLength(0);
  });

  it("비회원 수정은 비밀번호를, 삭제는 본문에 비밀번호를 담는다", async () => {
    const backend = mockBackend({
      "PATCH /api/v1/comments/5": ok({ id: 5 }),
      "DELETE /api/v1/comments/5": ok(null),
    });
    await run({
      intent: "edit",
      target: "edit-5",
      commentId: "5",
      content: "고침",
      guestPassword: "1234",
    });
    await run({ intent: "delete", target: "delete-5", commentId: "5", guestPassword: "1234" });
    expect(backend.callsTo("PATCH /api/v1/comments/5")[0].body).toEqual({
      content: "고침",
      secret: false,
      guestPassword: "1234",
    });
    expect(backend.callsTo("DELETE /api/v1/comments/5")[0].body).toEqual({ guestPassword: "1234" });
  });

  it("비회원 삭제에 비밀번호가 비면 거부", async () => {
    const backend = mockBackend();
    const result = asData<{ fieldErrors: unknown[] }>(
      await run({ intent: "delete", target: "delete-5", commentId: "5", guestPassword: "" }),
    );
    expect(result.data.fieldErrors).toEqual([{ field: "guestPassword", code: "REQUIRED" }]);
    expect(backend.calls).toHaveLength(0);
  });

  it("unlockComment는 내용을 받아 돌려주고, 틀린 비밀번호는 입력란 오류", async () => {
    const unlocked = { id: 5, content: "숨긴 내용", secret: true };
    mockBackend({ "POST /api/v1/comments/5/unlock": ok(unlocked) });
    const result = asData(
      await run({
        intent: "unlockComment",
        target: "unlock-5",
        commentId: "5",
        guestPassword: "1234",
      }),
    );
    expect(result.data).toEqual({
      intent: "unlockComment",
      target: "unlock-5",
      ok: true,
      comment: unlocked,
    });

    mockBackend({ "POST /api/v1/comments/5/unlock": fail(403, "GUEST_PASSWORD_MISMATCH") });
    const wrong = asData<Record<string, unknown>>(
      await run({
        intent: "unlockComment",
        target: "unlock-5",
        commentId: "5",
        guestPassword: "0000",
      }),
    );
    expect(wrong.data).toMatchObject({ ok: false, field: "guestPassword" });

    const empty = asData<{ fieldErrors: unknown[] }>(
      await run({ intent: "unlockComment", target: "unlock-5", commentId: "5", guestPassword: "" }),
    );
    expect(empty.data.fieldErrors).toEqual([{ field: "guestPassword", code: "REQUIRED" }]);
  });

  it("차단된 회원이 받는 403은 일반 거부(FORBIDDEN)로 폼에 남는다", async () => {
    mockBackend({ "POST /api/v1/posts/123/comments": fail(403, "FORBIDDEN") });
    const result = asData<Record<string, unknown>>(
      await run({ intent: "create", target: "new", content: "안녕" }),
    );
    expect(result.data).toMatchObject({ ok: false, resultCode: "FORBIDDEN" });
  });
});
