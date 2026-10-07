import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLoaderData, useLocation } from "react-router";

import { rememberLastBlog } from "~/auth/lastBlog.server";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog } from "~/manage/access.server";
import { MANAGE_MENU } from "~/manage/links";
import { privatePageMeta } from "~/seo/meta";
import consoleStyles from "~/styles/console.css?url";

import type { Route } from "./+types/layout";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: consoleStyles }];

/** 메뉴 정의는 `~/manage/links`(006 T013). 기존 import 경로를 위해 다시 내보낸다. */
export { MANAGE_MENU };

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("manage:title"), t("appName"));
}

/**
 * 블로그 관리 레이아웃(`/:handle/manage/**`, 006 FR-097·098). 로그인한 주인만 열고(남의 블로그·삭제된 블로그 404),
 * 연 블로그를 쿠키 `last_blog`로 기억한다(`/manage`·`/write` 진입점). 상단에서 내 다른 블로그의 같은 메뉴로 바꿀 수 있다.
 * 검색 엔진 수집 제외(noindex)는 각 화면의 meta가 넣는다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { user, handle } = await requireOwnedBlog(request, params.handle);
  rememberLastBlog(request, handle);
  return { handle, blogs: user.blogs };
}

export default function ManageLayout() {
  const { t } = useTranslation();
  const { handle, blogs } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const base = `/${handle}/manage`;
  const subPath = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const current = blogs.find((blog) => blog.handle === handle);

  return (
    <div className="manage">
      <header className="manage-header">
        <p className="manage-title">
          {t("manage:title")} · <strong>{current?.title ?? handle}</strong>
        </p>
        <p>
          <Link to={`/${handle}`}>{t("manage:viewBlog")}</Link>{" "}
          <Link to={`/${handle}/write`}>{t("manage:write")}</Link>
        </p>
        {blogs.length > 1 && (
          <nav aria-label={t("manage:switcher.label")} className="blog-switcher">
            <ul>
              {blogs.map((blog) => (
                <li key={blog.handle}>
                  {blog.handle === handle ? (
                    <span aria-current="true">{blog.title}</span>
                  ) : (
                    <Link to={`/${blog.handle}/manage${subPath}`}>{blog.title}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      {/* 좁은 화면에서는 접을 수 있는 메뉴(JS 없이 동작, 006 T019). 넓은 화면은 접기 제목을 CSS로 감춘다. */}
      <details className="console-menu" open>
        <summary>{t("manage:nav.menu")}</summary>
        <nav aria-label={t("manage:nav.label")} className="manage-menu">
          <ul>
            {MANAGE_MENU.filter((item) => item.available).map((item) => (
              <li key={item.key}>
                <NavLink to={`${base}${item.path}`} end>
                  {t(`manage:nav.${item.key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </details>
      <Outlet />
    </div>
  );
}
