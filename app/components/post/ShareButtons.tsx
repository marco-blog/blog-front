import { useId, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { shareToKakao } from "~/share/kakao.client";

export interface ShareButtonsProps {
  /** 글 절대 주소 */
  url: string;
  title: string;
  summary: string | null;
  /** 대표 이미지 절대 주소(1200x630), 없으면 null */
  imageUrl: string | null;
  /** Kakao JavaScript 키(`BLOG_KAKAO_JS_KEY`). 없으면 카카오톡 버튼을 숨긴다. */
  kakaoJsKey: string | null;
}

/** X 공유 창 주소 */
export function xShareUrl(url: string, title: string): string {
  return `https://x.com/intent/tweet?${new URLSearchParams({ url, text: title }).toString()}`;
}

/** 페이스북 공유 창 주소 */
export function facebookShareUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: url }).toString()}`;
}

type CopyState = "idle" | "copied" | "failed";

const noSubscribe = () => () => {};

/** 브라우저에서 하이드레이션이 끝났는지. 서버 렌더링(JS 없음)에서는 false */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

/**
 * 공유(002 FR-069): 주소 복사, 카카오톡, X, 페이스북. X·페이스북은 새 창 링크라 JS 없이도 동작한다.
 * 주소 복사는 Clipboard API를 쓰고, JS가 없거나(서버 렌더링) 복사에 실패하면 주소 입력란을 보여준다.
 */
export function ShareButtons({ url, title, summary, imageUrl, kakaoJsKey }: ShareButtonsProps) {
  const { t } = useTranslation();
  const urlId = useId();
  const hydrated = useHydrated();
  const [copy, setCopy] = useState<CopyState>("idle");
  const [kakaoFailed, setKakaoFailed] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  async function shareKakao(key: string) {
    setKakaoFailed(false);
    try {
      await shareToKakao(key, { title, description: summary, imageUrl, url });
    } catch {
      setKakaoFailed(true);
    }
  }

  const showUrlField = !hydrated || copy === "failed";
  const newWindow = t("discovery:share.newWindow");
  return (
    <section className="share" aria-label={t("discovery:share.label")}>
      <ul>
        {hydrated && (
          <li>
            <button type="button" onClick={() => void copyUrl()}>
              {t("discovery:share.copy")}
            </button>
          </li>
        )}
        {hydrated && kakaoJsKey && (
          <li>
            <button type="button" onClick={() => void shareKakao(kakaoJsKey)}>
              {t("discovery:share.kakao")}
            </button>
          </li>
        )}
        <li>
          <a
            href={xShareUrl(url, title)}
            target="_blank"
            rel="noopener noreferrer"
            title={newWindow}
          >
            {t("discovery:share.x")}
          </a>
        </li>
        <li>
          <a
            href={facebookShareUrl(url)}
            target="_blank"
            rel="noopener noreferrer"
            title={newWindow}
          >
            {t("discovery:share.facebook")}
          </a>
        </li>
      </ul>
      {copy === "copied" && <p role="status">{t("discovery:share.copied")}</p>}
      {copy === "failed" && <p role="alert">{t("discovery:share.copyFailed")}</p>}
      {kakaoFailed && <p role="alert">{t("discovery:share.kakaoFailed")}</p>}
      {showUrlField && (
        <p className="share-url">
          <label htmlFor={urlId}>{t("discovery:share.url")}</label>{" "}
          <input id={urlId} type="url" readOnly value={url} onFocus={(e) => e.target.select()} />
        </p>
      )}
    </section>
  );
}
