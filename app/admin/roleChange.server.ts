import { data } from "react-router";

import { createApiClient } from "~/api/client.server";
import type { AdminMember, UserRole } from "~/api/models";
import type { ApiFieldError } from "~/api/types";
import { ROLE_CHOICES } from "~/components/admin/RoleForm";

import { adminActionError, adminInvalid, type AdminActionData } from "./actions.server";

/**
 * 권한 바꾸기 폼(`RoleForm`, `intent=role`)의 action 공통(006 FR-105): 회원 번호·권한·확인 체크를 검사하고
 * `PUT /admin/users/{id}/role { role }`. 관리자 권한 화면(T054)과 회원 상세(T055)가 쓴다. `userId`를 주면 폼 값 대신 그 번호.
 */
export async function roleChangeAction(
  request: Request,
  intent: string,
  form: FormData,
  userId = String(form.get("userId") ?? "").trim(),
) {
  const role = String(form.get("role") ?? "");
  const errors: ApiFieldError[] = [
    ...(/^\d{1,18}$/.test(userId)
      ? []
      : [{ field: "userId", code: userId ? "INVALID" : "REQUIRED" }]),
    ...((ROLE_CHOICES as readonly string[]).includes(role)
      ? []
      : [{ field: "role", code: "INVALID" }]),
    ...(form.get("confirm") ? [] : [{ field: "confirm", code: "REQUIRED" }]),
  ];
  if (errors.length > 0) {
    return adminInvalid(intent, errors);
  }
  try {
    const member = await createApiClient(request).put<AdminMember>(`/admin/users/${userId}/role`, {
      body: { role: role as UserRole },
    });
    return data<AdminActionData<{ member: AdminMember }>>({ intent, ok: true, member });
  } catch (error) {
    return adminActionError(intent, error);
  }
}
