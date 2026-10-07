import { useTranslation } from "react-i18next";
import { Form, useNavigation } from "react-router";

import type { UserRole } from "~/api/models";

/** 고를 수 있는 권한(낮은 것부터) */
export const ROLE_CHOICES: readonly UserRole[] = ["USER", "ADMIN", "SUPER_ADMIN"];

export interface RoleFormProps {
  /** 정해진 회원(관리자 목록의 행). 없으면 회원 번호 입력란을 그린다(회원 번호로 관리자 지정). */
  member?: { userId: number; nickname: string; role: UserRole };
  legend: string;
  submitLabel?: string;
}

/**
 * 관리자 권한 바꾸기 폼(006 FR-105, T054): 새 권한 선택 + 확인 체크 → `intent=role`(`PUT /admin/users/{id}/role`).
 * 최고 관리자에게만 그린다. 확인 체크가 없으면 action이 `confirm` 필수 오류로 돌려보낸다(JS 없이 동작).
 */
export function RoleForm({ member, legend, submitLabel }: RoleFormProps) {
  const { t } = useTranslation();
  const submitting = useNavigation().state === "submitting";
  return (
    <Form method="post" className="role-form">
      <fieldset>
        <legend>{legend}</legend>
        <input type="hidden" name="intent" value="role" />
        {member ? (
          <input type="hidden" name="userId" value={member.userId} />
        ) : (
          <label>
            {t("admin:fields.userId")}{" "}
            <input type="text" name="userId" inputMode="numeric" pattern="\d*" required />
          </label>
        )}{" "}
        <label>
          {t("admin:admins.roleForm.role")}{" "}
          <select name="role" defaultValue={member?.role ?? "ADMIN"}>
            {ROLE_CHOICES.map((role) => (
              <option key={role} value={role}>
                {t(`admin:users.role.${role}`)}
              </option>
            ))}
          </select>
        </label>{" "}
        <label>
          <input type="checkbox" name="confirm" value="yes" required />{" "}
          {t("admin:admins.roleForm.confirm")}
        </label>{" "}
        <button type="submit" disabled={submitting}>
          {submitLabel ?? t("admin:admins.roleForm.submit")}
        </button>
      </fieldset>
    </Form>
  );
}
