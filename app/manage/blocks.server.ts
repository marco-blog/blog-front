import { data } from "react-router";

import { createApiClient } from "~/api/client.server";
import { isApiError } from "~/api/errors";
import { VALIDATION_FAILED, toFormError } from "~/api/formErrors";
import { parsePostId } from "~/blog/ids";

import { manageNotFound } from "./access.server";
import { isBlockIntent, type BlockActionData, type BlockIntent } from "./blocks";

/**
 * 회원 차단·해제 `action`(004 FR-146): `intent=block` → `PUT /blogs/{handle}/blocks/{userId}`(멱등),
 * `intent=unblock` → `DELETE /blogs/{handle}/blocks/{userId}`. 결과 문구에 쓸 닉네임은 폼의 `nickname`.
 * 주인이 아니면(403) 404로 숨긴다.
 */
export async function runBlockAction(request: Request, handle: string) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const userId = parsePostId(String(form.get("userId") ?? ""));
  const nickname = String(form.get("nickname") ?? "").trim() || null;
  if (!isBlockIntent(intent) || userId === null) {
    return data<BlockActionData>(
      {
        intent: (isBlockIntent(intent) ? intent : "block") as BlockIntent,
        ok: false,
        resultCode: VALIDATION_FAILED,
        field: null,
        fieldErrors: [],
      },
      { status: 400 },
    );
  }
  const api = createApiClient(request);
  try {
    if (intent === "block") {
      await api.put(`/blogs/${handle}/blocks/${userId}`);
    } else {
      await api.delete(`/blogs/${handle}/blocks/${userId}`);
    }
    return data<BlockActionData>({ intent, ok: true, nickname });
  } catch (error) {
    if (isApiError(error) && error.status === 403) {
      throw manageNotFound();
    }
    const { data: formError, status } = toFormError(error);
    return data<BlockActionData>({ ...formError, intent, ok: false }, { status });
  }
}
