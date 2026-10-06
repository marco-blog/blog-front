import { useTranslation } from "react-i18next";

import { metaT } from "~/i18n/meta";

import type { Route } from "./+types/home";

/** `/` 임시 메인. 003-portal에서 포털로 바꾼다(contracts/routes.md). */
export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return [{ title: t("appName") }];
}

export default function Home() {
  const { t } = useTranslation();
  return (
    <main>
      <h1>{t("home.title")}</h1>
      <p>{t("home.placeholder")}</p>
    </main>
  );
}
