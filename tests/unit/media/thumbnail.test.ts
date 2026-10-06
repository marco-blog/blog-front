import { describe, expect, it } from "vitest";

import { imageFieldValue } from "~/media/form";
import {
  THUMBNAIL_SIZES,
  mediaKeyOf,
  mediaKeysIn,
  mediaUrl,
  ogImageUrl,
  thumbnailImage,
  thumbnailUrl,
} from "~/media/thumbnail";

const KEY = "k3Jd9fQ2xLmA7pZ0bR5tYw";
const OTHER = "Zz9Yy8Xx7Ww6Vv5Uu4Tt3S";
const URL_ = `/media/${KEY}`;

/** backend `blog.media.thumbnail.sizes` 기본값(contracts/api.md) */
const ALLOWED = [
  "50x50",
  "100x100",
  "160x160",
  "200x200",
  "300x200",
  "320x320",
  "600x400",
  "1200x630",
  "1200x800",
  "2400x1260",
];

describe("썸네일 주소(FR-130)", () => {
  it.each([
    ["card", "300x200", "600x400"],
    ["cover", "600x400", "1200x800"],
    ["avatarSmall", "50x50", "100x100"],
    ["avatar", "100x100", "200x200"],
    ["og", "1200x630", "2400x1260"],
  ] as const)("%s: %s와 2배 %s(srcset)", (preset, size, double) => {
    const image = thumbnailImage(URL_, preset);

    const [width, height] = size.split("x").map(Number);
    expect(image).toEqual({
      src: `${URL_}/${size}`,
      srcSet: `${URL_}/${size} 1x, ${URL_}/${double} 2x`,
      width,
      height,
    });
  });

  it("쓰는 크기와 2배 크기는 모두 backend 허용 목록에 있다", () => {
    for (const { width, height } of Object.values(THUMBNAIL_SIZES)) {
      expect(ALLOWED).toContain(`${width}x${height}`);
      expect(ALLOWED).toContain(`${width * 2}x${height * 2}`);
    }
  });

  it("fit=contain은 쿼리로, 기본값 cover는 생략한다", () => {
    expect(thumbnailUrl(URL_, { width: 300, height: 200 })).toBe(`${URL_}/300x200`);
    expect(thumbnailUrl(URL_, { width: 300, height: 200 }, "contain")).toBe(
      `${URL_}/300x200?fit=contain`,
    );
    expect(thumbnailImage(URL_, "card", "contain").srcSet).toBe(
      `${URL_}/300x200?fit=contain 1x, ${URL_}/600x400?fit=contain 2x`,
    );
  });

  it("이 서비스의 이미지 주소가 아니면 그대로 쓴다(srcset 없음)", () => {
    expect(thumbnailUrl("https://example.com/a.png", THUMBNAIL_SIZES.card)).toBe(
      "https://example.com/a.png",
    );
    expect(thumbnailImage("/media/short", "avatar")).toEqual({
      src: "/media/short",
      width: 100,
      height: 100,
    });
    expect(thumbnailUrl(`${URL_}/300x200`, THUMBNAIL_SIZES.card)).toBe(`${URL_}/300x200`);
  });

  it("og:image는 1200x630, 이미지가 없으면 null", () => {
    expect(ogImageUrl(URL_)).toBe(`${URL_}/1200x630`);
    expect(ogImageUrl(null)).toBeNull();
    expect(ogImageUrl(undefined)).toBeNull();
  });
});

describe("이미지 키", () => {
  it("mediaKeyOf: /media/{key}만", () => {
    expect(mediaKeyOf(URL_)).toBe(KEY);
    expect(mediaKeyOf(`${URL_}/300x200`)).toBeNull();
    expect(mediaKeyOf("/media/../etc")).toBeNull();
    expect(mediaKeyOf(null)).toBeNull();
    expect(mediaUrl(KEY)).toBe(URL_);
  });

  it("mediaKeysIn: 본문 이미지 키를 나온 순서대로, 중복 없이", () => {
    const markdown = [
      `![첫](/media/${OTHER})`,
      "![밖](https://example.com/x.png)",
      `![둘](/media/${KEY} "제목")`,
      `<img src="/media/${OTHER}/300x200">`,
      `/media/${KEY}X 는 키가 아니다`,
    ].join("\n");

    expect(mediaKeysIn(markdown)).toEqual([OTHER, KEY]);
    expect(mediaKeysIn("")).toEqual([]);
    expect(mediaKeysIn(null)).toEqual([]);
  });
});

describe("imageFieldValue", () => {
  it("보내지 않았으면 undefined(그대로), 빈 값이면 null(지움), 아니면 키", () => {
    const form = new FormData();
    expect(imageFieldValue(form, "profileImageMediaKey")).toBeUndefined();
    form.set("profileImageMediaKey", "");
    expect(imageFieldValue(form, "profileImageMediaKey")).toBeNull();
    form.set("profileImageMediaKey", ` ${KEY} `);
    expect(imageFieldValue(form, "profileImageMediaKey")).toBe(KEY);
  });
});
