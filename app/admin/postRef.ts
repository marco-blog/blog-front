import { parsePostId } from "~/blog/ids";

/**
 * 콘솔에서 받은 글 지정 값에서 글 번호를 꺼낸다(003 contracts/routes.md): 숫자 번호(`123`),
 * 글 주소(`https://blog.java21.net/{handle}/{id}`, 다른 호스트도 받는다) 또는 경로(`/{handle}/{id}`).
 * 주소의 `?query`·`#hash`와 끝 `/`는 무시한다. 알아볼 수 없으면 null.
 */
export function parsePostRef(input: string | null | undefined): number | null {
  const text = (input ?? "").trim();
  if (!text) {
    return null;
  }
  if (/^\d+$/.test(text)) {
    return parsePostId(text);
  }
  let path: string;
  if (text.startsWith("/")) {
    path = text;
  } else {
    try {
      const url = new URL(text);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return null;
      }
      path = url.pathname;
    } catch {
      return null;
    }
  }
  const segments = path.split(/[?#]/, 1)[0].split("/").filter(Boolean);
  if (segments.length !== 2) {
    return null;
  }
  return parsePostId(segments[1]);
}
