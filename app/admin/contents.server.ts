import { data } from "react-router";

import { createApiClient } from "~/api/client.server";
import { isApiError } from "~/api/errors";
import type { ApiFieldError } from "~/api/types";
import { hiddenContentPath } from "~/moderation/reportTarget";

import { requireAdmin, throwAdminError } from "./access.server";
import { adminActionError, adminInvalid, type AdminActionData } from "./actions.server";
import {
  CONTENT_API,
  CONTENT_HIDE_TYPE,
  HIDE_REASON_MAX,
  contentQuery,
  isScopeRequired,
  needsScope,
  parseContentFilters,
  type ContentFilters,
  type ContentKind,
} from "./contentSearch";

export interface ContentListData<T> {
  kind: ContentKind;
  filters: ContentFilters;
  /** 검색하지 못했으면(범위 없음·입력 오류) null */
  rows: T[] | null;
  totalCount: number;
  scopeRequired: boolean;
  fieldErrors: ApiFieldError[];
}

/**
 * 콘텐츠 관리 탭 loader 공통(006 T037): 관리자 확인 → 조건 해석 → 검색 API. 댓글·방명록에서 범위 없는 내용 검색은 backend를
 * 부르지 않고 안내하며, backend 400(검색어 길이 등)도 오류 화면 대신 폼 옆 문구로 보여준다.
 */
export async function loadContents<T>(
  request: Request,
  kind: ContentKind,
): Promise<ContentListData<T>> {
  await requireAdmin(request);
  const filters = parseContentFilters(kind, new URL(request.url).searchParams);
  const base = { kind, filters };
  if (needsScope(kind, filters)) {
    return { ...base, rows: null, totalCount: 0, scopeRequired: true, fieldErrors: [] };
  }
  try {
    const response = await createApiClient(request).send<T[]>(CONTENT_API[kind], {
      query: contentQuery(filters),
    });
    return {
      ...base,
      rows: response.result,
      totalCount: response.totalCount ?? response.result.length,
      scopeRequired: false,
      fieldErrors: [],
    };
  } catch (error) {
    if (isApiError(error) && error.status === 400) {
      return {
        ...base,
        rows: null,
        totalCount: 0,
        scopeRequired: isScopeRequired(error.fieldErrors),
        fieldErrors: error.fieldErrors,
      };
    }
    return throwAdminError(error);
  }
}

/**
 * 숨김·해제 action(`intent=hide|unhide`, `id`, 숨김은 `reason` 필수 500자) → 005
 * `PUT /admin/contents/{segment}/{id}/hidden { reason }`·`DELETE …/hidden`(006 T039).
 */
export async function contentHideAction(request: Request, kind: ContentKind) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const idText = String(form.get("id") ?? "");
  if ((intent !== "hide" && intent !== "unhide") || !/^\d{1,18}$/.test(idText)) {
    return adminInvalid(intent);
  }
  const reason = String(form.get("reason") ?? "").trim();
  if (intent === "hide" && !reason) {
    return adminInvalid(intent, [{ field: "reason", code: "REQUIRED" }]);
  }
  if (reason.length > HIDE_REASON_MAX) {
    return adminInvalid(intent, [
      { field: "reason", code: "TOO_LONG", params: { max: HIDE_REASON_MAX } },
    ]);
  }
  const path = hiddenContentPath(CONTENT_HIDE_TYPE[kind], Number(idText));
  const api = createApiClient(request);
  try {
    if (intent === "hide") {
      await api.put(path, { body: { reason } });
    } else {
      await api.delete(path);
    }
  } catch (error) {
    return adminActionError(intent, error);
  }
  return data<AdminActionData>({ intent, ok: true });
}
