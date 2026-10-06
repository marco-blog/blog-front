import type { MetaDescriptor } from "react-router";

/**
 * 라우트 `meta`가 쓰는 SEO 태그(FR-036, contracts/routes.md meta 열).
 * 공개 화면은 제목·요약·Open Graph·canonical을, 로그인·작성 화면은 noindex를 넣는다.
 */
export interface PageMetaInput {
  title: string;
  description?: string | null;
  /** 절대 주소 */
  image?: string | null;
  /** 이 화면의 대표 주소(절대). og:url·canonical에 쓴다. */
  url?: string | null;
  type?: "website" | "article";
  siteName?: string;
  noindex?: boolean;
}

export const NOINDEX: MetaDescriptor = { name: "robots", content: "noindex" };

export function pageMeta(input: PageMetaInput): MetaDescriptor[] {
  const tags: MetaDescriptor[] = [{ title: input.title }];
  const description = input.description?.trim();
  if (description) {
    tags.push({ name: "description", content: description });
  }
  tags.push(
    { property: "og:title", content: input.title },
    { property: "og:type", content: input.type ?? "website" },
  );
  if (description) {
    tags.push({ property: "og:description", content: description });
  }
  if (input.siteName) {
    tags.push({ property: "og:site_name", content: input.siteName });
  }
  if (input.image) {
    tags.push(
      { property: "og:image", content: input.image },
      { name: "twitter:card", content: "summary_large_image" },
    );
  }
  if (input.url) {
    tags.push(
      { property: "og:url", content: input.url },
      { tagName: "link", rel: "canonical", href: input.url },
    );
  }
  if (input.noindex) {
    tags.push(NOINDEX);
  }
  return tags;
}

/** 검색에 넣지 않는 화면(로그인, 가입, 작성, 설정): `{제목} - {서비스명}` + noindex */
export function privatePageMeta(title: string, appName: string): MetaDescriptor[] {
  return [{ title: `${title} - ${appName}` }, NOINDEX];
}

/** `/media/...` 같은 상대 주소를 서비스 출처 기준 절대 주소로. 비었으면 null */
export function absoluteUrl(origin: string, pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) {
    return null;
  }
  try {
    return new URL(pathOrUrl, origin).toString();
  } catch {
    return null;
  }
}
