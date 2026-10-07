import { useTranslation } from "react-i18next";
import { Form } from "react-router";

export const USER_SEARCH_BY = ["nickname", "email", "handle"] as const;
export type UserSearchBy = (typeof USER_SEARCH_BY)[number];
/** backend와 같은 최소 검색어 길이 */
export const USER_QUERY_MIN = 2;

const LABEL: Record<UserSearchBy, string> = {
  nickname: "admin:users.search.byNickname",
  email: "admin:users.search.byEmail",
  handle: "admin:users.search.byHandle",
};

/** 회원 찾기(005 `/admin/users`): 찾는 방법(닉네임 앞부분·이메일 정확·블로그 주소 정확)과 검색어. GET 폼 */
export function UserSearch({
  q,
  by,
  error,
}: {
  q: string;
  by: UserSearchBy;
  error?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <Form method="get" className="user-search" role="search">
      <fieldset>
        <legend>{t("admin:users.search.legend")}</legend>
        <label>
          {t("admin:users.search.by")}{" "}
          <select name="by" defaultValue={by}>
            {USER_SEARCH_BY.map((item) => (
              <option key={item} value={item}>
                {t(LABEL[item])}
              </option>
            ))}
          </select>
        </label>{" "}
        <label>
          {t("admin:users.search.q")}{" "}
          <input
            name="q"
            type="search"
            defaultValue={q}
            minLength={USER_QUERY_MIN}
            required
            aria-invalid={error ? true : undefined}
          />
        </label>{" "}
        <button type="submit">{t("admin:users.search.submit")}</button>
        <p className={error ? "form-error" : "form-hint"}>
          {error ?? t("admin:users.search.hint")}
        </p>
      </fieldset>
    </Form>
  );
}
