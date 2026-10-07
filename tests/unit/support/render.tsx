import { render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { Outlet, createRoutesStub } from "react-router";

import type { Language } from "~/i18n/config";
import { createI18n } from "~/i18n/instance";
import { resourcesFor } from "~/i18n/resources.server";
import type { RootData } from "~/root";

type StubRoutes = Parameters<typeof createRoutesStub>[0];

export interface RenderRoutesOptions {
  initialEntries?: string[];
  language?: Language;
  user?: RootData["user"];
  timeZone?: string;
}

export function rootData(
  language: Language = "ko",
  user: RootData["user"] = null,
  timeZone = "Asia/Seoul",
): RootData {
  return { language, resources: resourcesFor(language), user, timeZone };
}

/** 프레임워크 모드처럼 id가 root인 상위 라우트(언어·회원·시간대) 아래에 화면 라우트를 그린다. */
export function renderRoutes(routes: StubRoutes, options: RenderRoutesOptions = {}) {
  const language = options.language ?? "ko";
  const data = rootData(language, options.user ?? null, options.timeZone);
  const Stub = createRoutesStub([
    {
      id: "root",
      path: "/",
      loader: () => data,
      Component: Outlet,
      HydrateFallback: () => null,
      children: routes,
    },
  ]);
  return render(
    <I18nextProvider i18n={createI18n(language, data.resources)}>
      <Stub initialEntries={options.initialEntries ?? ["/"]} />
    </I18nextProvider>,
  );
}

export const testI18n = (language: Language = "ko") => createI18n(language, resourcesFor(language));
