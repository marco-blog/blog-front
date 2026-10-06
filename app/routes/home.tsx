import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { metaT } from "~/i18n/meta";

import type { Route } from "./+types/home";

/** `/` 임시 메인: 서비스 소개와 가입·로그인 링크. 003-portal에서 포털로 바꾼다(contracts/routes.md). */
export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return [{ title: t("appName") }, { name: "description", content: t("home.intro") }];
}

export default function Home() {
  const { t } = useTranslation();
  return (
    <main>
      <h1>{t("home.title")}</h1>
      <p>{t("home.intro")}</p>
      <p>
        <Link to="/signup">{t("home.signup")}</Link> <Link to="/login">{t("home.login")}</Link>
      </p>
    </main>
  );
}
