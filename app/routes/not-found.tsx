import { data } from "react-router";

import { NotFound } from "~/components/NotFound";
import { metaT } from "~/i18n/meta";

import type { Route } from "./+types/not-found";

/** 어느 라우트에도 맞지 않는 주소. 화면은 404 상태 코드로 응답한다(contracts/routes.md). */
export function loader() {
  return data(null, { status: 404 });
}

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return [
    { title: `${t("notFound.title")} - ${t("appName")}` },
    { name: "robots", content: "noindex" },
  ];
}

export default function NotFoundRoute() {
  return <NotFound />;
}
