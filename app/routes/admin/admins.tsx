import { useTranslation } from "react-i18next";
import { Link, useActionData, useLoaderData } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { adminInvalid } from "~/admin/actions.server";
import { roleChangeAction } from "~/admin/roleChange.server";
import { isSuperAdmin } from "~/admin/roles";
import { createApiClient } from "~/api/client.server";
import type { AdminMember } from "~/api/models";
import { AdminFormErrors } from "~/components/admin/AdminFormErrors";
import { RoleForm } from "~/components/admin/RoleForm";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/admins";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:admins.title"), t("appName"));
}

/**
 * 관리자 권한(`/admin/admins`, 006 FR-105, T054): 관리자 목록(권한 높은 순). 최고 관리자에게만 행마다 권한 바꾸기와
 * "회원 번호로 관리자 지정" 폼, 일반 관리자는 읽기 전용(backend도 403).
 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const admins = await createApiClient(request)
    .get<AdminMember[]>("/admin/admins")
    .catch(throwAdminError);
  return { admins, canChange: isSuperAdmin(user.role) };
}

/** `intent=role` + `userId` + `role` + `confirm` → PUT /admin/users/{id}/role */
export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent !== "role") {
    return adminInvalid(intent);
  }
  return roleChangeAction(request, intent, form);
}

export default function AdminAdmins() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { admins, canChange } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const changed = result?.ok && "member" in result ? (result.member as AdminMember) : null;
  return (
    <main className="admin-admins">
      <h1>{t("admin:admins.title")}</h1>
      <p className="form-hint">{t(canChange ? "admin:admins.hint" : "admin:admins.readOnly")}</p>
      {changed && (
        <p role="status">
          {t("admin:admins.done", {
            nickname: changed.nickname,
            role: t(`admin:users.role.${changed.role}`),
          })}
        </p>
      )}
      <AdminFormErrors error={result && !result.ok ? result : null} />
      {admins.length === 0 ? (
        <p>{t("admin:admins.empty")}</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table" aria-label={t("admin:admins.list")}>
            <thead>
              <tr>
                <th scope="col">{t("admin:admins.columns.nickname")}</th>
                <th scope="col">{t("admin:admins.columns.role")}</th>
                <th scope="col">{t("admin:admins.columns.status")}</th>
                <th scope="col">{t("admin:admins.columns.createdAt")}</th>
                {canChange && <th scope="col">{t("admin:admins.columns.change")}</th>}
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin.userId}>
                  <td>
                    <Link to={`/admin/users/${admin.userId}`}>{admin.nickname}</Link>
                  </td>
                  <td>{t(`admin:users.role.${admin.role}`)}</td>
                  <td>{t(`admin:users.status.${admin.status}`)}</td>
                  <td>{format.date(admin.createdAt)}</td>
                  {canChange && (
                    <td>
                      <RoleForm
                        member={admin}
                        legend={t("admin:admins.roleForm.label", { nickname: admin.nickname })}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canChange && (
        <section aria-labelledby="admins-grant">
          <h2 id="admins-grant">{t("admin:admins.grant.legend")}</h2>
          <p className="form-hint">{t("admin:admins.grant.hint")}</p>
          <RoleForm
            legend={t("admin:admins.grant.legend")}
            submitLabel={t("admin:admins.grant.submit")}
          />
        </section>
      )}
    </main>
  );
}
