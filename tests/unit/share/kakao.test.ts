// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  KAKAO_SDK_INTEGRITY,
  KAKAO_SDK_ORIGIN,
  KAKAO_SDK_URL,
  KAKAO_SDK_VERSION,
  type KakaoSdk,
  loadKakaoSdk,
  resetKakaoSdkForTest,
  shareToKakao,
} from "~/share/kakao.client";

function sdkScripts(): HTMLScriptElement[] {
  return [...document.head.querySelectorAll<HTMLScriptElement>("script")].filter(
    (script) => script.src === KAKAO_SDK_URL,
  );
}

/** SDK 스크립트가 다 내려받아진 것처럼 window.Kakao를 만들고 onload를 부른다. */
function fakeSdk(initialized = false) {
  const sdk = {
    initialized,
    init: vi.fn(function (this: { initialized: boolean }) {
      this.initialized = true;
    }),
    isInitialized: vi.fn(function (this: { initialized: boolean }) {
      return this.initialized;
    }),
    Share: { sendDefault: vi.fn() },
  };
  return sdk;
}

function finishLoading(sdk: ReturnType<typeof fakeSdk> | null) {
  const script = sdkScripts().at(-1)!;
  if (sdk) {
    window.Kakao = sdk as unknown as KakaoSdk;
  }
  script.onload?.(new Event("load"));
}

const content = {
  title: "JPA N+1 정리",
  description: "요약",
  imageUrl: "https://blog.java21.net/media/k3Jd9fQ2xLmA7pZ0bR5tYw/1200x630",
  url: "https://blog.java21.net/marco/123",
};

beforeEach(() => {
  delete window.Kakao;
  resetKakaoSdkForTest();
  for (const script of sdkScripts()) script.remove();
});

afterEach(() => {
  delete window.Kakao;
});

/** 카카오톡 공유 SDK(T076, 002 research D9) */
describe("kakao SDK", () => {
  it("버전과 SRI 해시를 고정한 공식 CDN 주소", () => {
    expect(KAKAO_SDK_VERSION).toMatch(/^2\.\d+\.\d+$/);
    expect(KAKAO_SDK_URL).toBe(
      `https://t1.kakaocdn.net/kakao_js_sdk/${KAKAO_SDK_VERSION}/kakao.min.js`,
    );
    expect(KAKAO_SDK_URL.startsWith(KAKAO_SDK_ORIGIN)).toBe(true);
    expect(KAKAO_SDK_INTEGRITY).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
  });

  it("첫 클릭 때만 <script>를 integrity·crossorigin과 함께 한 번 넣고, init(key)은 한 번", async () => {
    expect(sdkScripts()).toHaveLength(0);
    const sdk = fakeSdk();

    const first = shareToKakao("kakao-key", content);
    const second = shareToKakao("kakao-key", content);
    expect(sdkScripts()).toHaveLength(1);
    const script = sdkScripts()[0];
    expect(script.integrity).toBe(KAKAO_SDK_INTEGRITY);
    expect(script.crossOrigin).toBe("anonymous");
    finishLoading(sdk);
    await Promise.all([first, second]);

    await shareToKakao("kakao-key", content);

    expect(sdkScripts()).toHaveLength(1);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith("kakao-key");
    expect(sdk.Share.sendDefault).toHaveBeenCalledTimes(3);
  });

  it("피드 템플릿: 제목·요약·대표 이미지 1200x630·글 주소", async () => {
    const sdk = fakeSdk(true);
    window.Kakao = sdk as unknown as KakaoSdk;

    await shareToKakao("kakao-key", content);

    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.Share.sendDefault).toHaveBeenCalledWith({
      objectType: "feed",
      content: {
        title: "JPA N+1 정리",
        description: "요약",
        imageUrl: content.imageUrl,
        imageWidth: 1200,
        imageHeight: 630,
        link: { mobileWebUrl: content.url, webUrl: content.url },
      },
    });
  });

  it("대표 이미지가 없으면 텍스트 템플릿, 요약이 없으면 빈 설명", async () => {
    const sdk = fakeSdk(true);
    window.Kakao = sdk as unknown as KakaoSdk;

    await shareToKakao("kakao-key", { ...content, imageUrl: null });
    await shareToKakao("kakao-key", { ...content, description: null });

    expect(sdk.Share.sendDefault).toHaveBeenNthCalledWith(1, {
      objectType: "text",
      text: "JPA N+1 정리",
      link: { mobileWebUrl: content.url, webUrl: content.url },
    });
    expect(sdk.Share.sendDefault).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ content: expect.objectContaining({ description: "" }) }),
    );
  });

  it("불러오지 못하면 실패하고, 다음 클릭에서 다시 시도한다", async () => {
    const failed = loadKakaoSdk();
    sdkScripts()[0].onerror?.(new Event("error"));
    await expect(failed).rejects.toThrow("Kakao SDK failed to load");
    expect(sdkScripts()).toHaveLength(0);

    const empty = loadKakaoSdk();
    finishLoading(null);
    await expect(empty).rejects.toThrow("Kakao SDK did not load");

    const retry = loadKakaoSdk();
    expect(sdkScripts()).toHaveLength(1);
    const sdk = fakeSdk();
    finishLoading(sdk);
    await expect(retry).resolves.toBe(sdk);
  });
});
