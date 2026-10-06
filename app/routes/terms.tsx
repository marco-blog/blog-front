import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";

import { LegalDocumentView } from "~/components/legal/LegalDocumentView";
import { metaT } from "~/i18n/meta";
import { loadLegalDocument } from "~/legal/legal.server";

import type { Route } from "./+types/terms";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return [{ title: `${t("legal:terms.title")} - ${t("appName")}` }];
}

/** `/terms` SSR(FR-137, contracts/routes.md): 화면 언어판 + "한국어판 우선" 안내 */
export function loader({ request }: Route.LoaderArgs) {
  return loadLegalDocument(request, "terms");
}

export default function Terms() {
  const { t } = useTranslation();
  const { document } = useLoaderData<typeof loader>();
  return <LegalDocumentView title={t("legal:terms.title")} document={document} />;
}
