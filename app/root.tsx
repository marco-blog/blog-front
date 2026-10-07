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

import { forwardBackendCookies } from "~/api/backendCookies.server";
import { errorMessage } from "~/api/errorMessage";
import { isApiError } from "~/api/errors";
import { getSessionUser } from "~/auth/session.server";
import { ErrorPage } from "~/components/ErrorPage";
import { Footer } from "~/components/layout/Footer";
import { Header, type HeaderUser } from "~/components/layout/Header";
import { ReleaseNoteBanner, type UnseenReleaseNote } from "~/components/layout/ReleaseNoteBanner";
import { NotFound } from "~/components/NotFound";
import { DEFAULT_LANGUAGE } from "~/i18n/config";
import { FALLBACK_RESOURCES } from "~/i18n/fallback-resources";
import { DEFAULT_TIME_ZONE } from "~/i18n/format";
import { createI18n } from "~/i18n/instance";
import { resolveLanguage } from "~/i18n/resolveLanguage.server";
import { resourcesFor } from "~/i18n/resources.server";
import type { RootLoaderData } from "~/i18n/root-data";

import type { Route } from "./+types/root";

export interface RootData extends RootLoaderData {
  /** 로그인 회원(상단 메뉴용). 비로그인이면 null */
  user: HeaderUser | null;
  /** 날짜를 보여줄 시간대: 회원 설정, 비회원은 Asia/Seoul(FR-153) */
  timeZone?: string;
  /** 로그인 회원이 아직 보지 않은 새 릴리스 노트(003 FR-163 배너). 없거나 비로그인이면 null */
  unseenReleaseNote?: UnseenReleaseNote | null;
}

/**
 * 모든 요청에서 backend가 준 Set-Cookie(로그인·리프레시·로그아웃 등)와 front 쿠키를 브라우저 응답에 싣는다
 * (tasks.md "구현 전 결정 사항" 1번).
 */
export const middleware: Route.MiddlewareFunction[] = [forwardBackendCookies];

/**
 * 로그인 회원(/me)과 화면 언어를 정하고(FR-149) 그 언어의 번역 리소스를 브라우저로 넘긴다(research.md R22).
 * backend에 닿지 못해도 공개 화면은 비로그인 상태로 그린다.
 */
export async function loader({ request }: Route.LoaderArgs): Promise<RootData> {
  const member = await getSessionUser(request).catch((error: unknown) => {
    if (isApiError(error)) {
      return null;
    }
    throw error;
  });
  const language = resolveLanguage(request, member?.locale);
  return {
    language,
    resources: resourcesFor(language),
    user: member && {
      userId: member.userId,
      nickname: member.nickname,
      role: member.role,
      blogs: member.blogs.map((blog) => blog.handle),
      unreadNotificationCount: member.unreadNotificationCount ?? 0,
    },
    timeZone: member?.timeZone || DEFAULT_TIME_ZONE,
    unseenReleaseNote: member?.unseenReleaseNote ?? null,
  };
}

/** 모든 화면(오류 화면 포함)의 공통 틀: 상단, 본문, 하단 */
export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const language = data?.language ?? DEFAULT_LANGUAGE;
  const resources = data?.resources ?? FALLBACK_RESOURCES;
  const i18n = useMemo(() => createI18n(language, resources), [language, resources]);

  return (
    <html lang={language}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <I18nextProvider i18n={i18n}>
          <Header user={data?.user ?? null} />
          {data?.user && data.unseenReleaseNote && (
            <ReleaseNoteBanner note={data.unseenReleaseNote} />
          )}
          {children}
          <Footer />
        </I18nextProvider>
        {/* CSP nonce는 entry.server의 <ServerRouter nonce>가 기본값으로 넘긴다(research.md R27). */}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

/**
 * 오류 경계. 404(없는 주소, 볼 권한이 없는 자원)는 찾을 수 없음 화면이며 HTTP 상태도 404다.
 * loader가 `throw data(..., { status: 404 })`나 `throw apiErrorResponse(error)`로 던진 상태를 그대로 쓴다.
 */
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
