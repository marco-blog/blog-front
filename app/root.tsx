import { useMemo } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import { ErrorPage } from "~/components/ErrorPage";
import { NotFound } from "~/components/NotFound";
import { DEFAULT_LANGUAGE } from "~/i18n/config";
import { errorMessage } from "~/i18n/errors";
import { createI18n } from "~/i18n/instance";
import { resolveLanguage } from "~/i18n/language";
import { resourcesFor } from "~/i18n/resources.server";
import type { RootLoaderData } from "~/i18n/root-data";

import type { Route } from "./+types/root";

/** 화면 언어를 정하고(FR-149) 그 언어의 번역 리소스를 브라우저로 넘긴다(research.md R22). */
export function loader({ request }: Route.LoaderArgs): RootLoaderData {
  const language = resolveLanguage(request);
  return { language, resources: resourcesFor(language) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const language = data?.language ?? DEFAULT_LANGUAGE;
  const resources = data?.resources;
  const i18n = useMemo(() => createI18n(language, resources ?? {}), [language, resources]);

  return (
    <html lang={language}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation();
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return <NotFound />;
    }
    const code = (error.data as { resultCode?: string } | null)?.resultCode;
    return <ErrorPage message={code ? errorMessage(t, code) : undefined} />;
  }
  const stack = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;
  return <ErrorPage stack={stack} />;
}
