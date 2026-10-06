/**
 * 카카오톡 공유(002 FR-069, research D9). 공유 URL 방식이 없어 Kakao JavaScript SDK 2.x를 쓴다.
 * SDK는 공식 CDN에서 공유 버튼을 처음 누를 때만, 버전을 고정하고 SRI(`integrity`)와 함께 불러온다.
 * CSP는 `BLOG_KAKAO_JS_KEY`가 있을 때만 `script-src`에 {@link KAKAO_SDK_ORIGIN}을 더한다(server/securityHeaders.ts).
 * 버전을 올리면 Kakao Developers 문서의 해당 버전 integrity 값으로 {@link KAKAO_SDK_INTEGRITY}를 함께 바꾼다.
 */
export const KAKAO_SDK_VERSION = "2.7.4";
export const KAKAO_SDK_ORIGIN = "https://t1.kakaocdn.net";
export const KAKAO_SDK_URL = `${KAKAO_SDK_ORIGIN}/kakao_js_sdk/${KAKAO_SDK_VERSION}/kakao.min.js`;
export const KAKAO_SDK_INTEGRITY =
  "sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka";

/** SDK 중 이 화면이 쓰는 부분 */
export interface KakaoSdk {
  init(appKey: string): void;
  isInitialized(): boolean;
  Share: { sendDefault(settings: Record<string, unknown>): void };
}

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

export interface KakaoShareContent {
  title: string;
  description: string | null;
  /** 대표 이미지 절대 주소(1200x630). 없으면 텍스트 템플릿으로 보낸다. */
  imageUrl: string | null;
  /** 글 절대 주소. Kakao Developers에 등록한 도메인이어야 한다. */
  url: string;
}

let loading: Promise<KakaoSdk> | null = null;

/** SDK `<script>`를 한 번만 넣는다. 실패하면 다음 클릭에서 다시 시도한다. */
export function loadKakaoSdk(): Promise<KakaoSdk> {
  if (window.Kakao) {
    return Promise.resolve(window.Kakao);
  }
  loading ??= new Promise<KakaoSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = KAKAO_SDK_URL;
    script.integrity = KAKAO_SDK_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => {
      if (window.Kakao) {
        resolve(window.Kakao);
      } else {
        fail(new Error("Kakao SDK did not load"));
      }
    };
    script.onerror = () => fail(new Error("Kakao SDK failed to load"));
    function fail(error: Error) {
      script.remove();
      loading = null;
      reject(error);
    }
    document.head.appendChild(script);
  });
  return loading;
}

/** SDK를 불러와 한 번 초기화하고 공유 창을 연다. */
export async function shareToKakao(appKey: string, content: KakaoShareContent): Promise<void> {
  const kakao = await loadKakaoSdk();
  if (!kakao.isInitialized()) {
    kakao.init(appKey);
  }
  const link = { mobileWebUrl: content.url, webUrl: content.url };
  if (content.imageUrl) {
    kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: content.title,
        description: content.description ?? "",
        imageUrl: content.imageUrl,
        imageWidth: 1200,
        imageHeight: 630,
        link,
      },
    });
    return;
  }
  kakao.Share.sendDefault({ objectType: "text", text: content.title, link });
}

/** 테스트용: 불러오는 중인 상태를 지운다. */
export function resetKakaoSdkForTest(): void {
  loading = null;
}
