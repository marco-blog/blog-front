import { describe, expect, it } from "vitest";

import type { ReleaseNoteSummary } from "~/api/models";
import {
  compareVersionsDesc,
  groupVersions,
  historyHref,
  parseRevisionNo,
  parseVersionParam,
  plainTextExcerpt,
  revisionHref,
  searchQueryError,
  versionHref,
} from "~/updates/versionTree";

const note = (version: string): ReleaseNoteSummary => ({
  version,
  title: `v${version} 제목`,
  releaseDate: "2026-10-06",
  firstPublishedAt: "2026-10-06T00:00:00Z",
  lang: "ko",
});

/** 버전 트리(003 T113) */
describe("versionTree", () => {
  it("major.minor로 묶고, 묶음도 묶음 안도 새 버전이 위(숫자 비교: 1.10 > 1.9)", () => {
    const groups = groupVersions(
      ["1.2.0", "1.9.3", "1.10.0", "1.2.1", "1.9.10", "0.9.0", "2.0.0", "1.9.2"].map(note),
    );

    expect(groups.map((group) => [group.key, group.items.map((item) => item.version)])).toEqual([
      ["2.0", ["2.0.0"]],
      ["1.10", ["1.10.0"]],
      ["1.9", ["1.9.10", "1.9.3", "1.9.2"]],
      ["1.2", ["1.2.1", "1.2.0"]],
      ["0.9", ["0.9.0"]],
    ]);
    expect(groupVersions([])).toEqual([]);
  });

  it("compareVersionsDesc는 새 버전이 앞, 같으면 0", () => {
    expect(["1.9.0", "1.10.0", "1.2.0"].sort(compareVersionsDesc)).toEqual([
      "1.10.0",
      "1.9.0",
      "1.2.0",
    ]);
    expect(compareVersionsDesc("1.0.0", "1.0.0")).toBe(0);
  });

  it("주소 조각 v1.2.3만 버전으로 읽는다", () => {
    expect(parseVersionParam("v1.2.3")).toBe("1.2.3");
    expect(parseVersionParam("v10.20.30")).toBe("10.20.30");
    for (const bad of [
      undefined,
      "",
      "1.2.3",
      "v1.2",
      "v1.2.3.4",
      "v1.2.x",
      "va.b.c",
      "v1234567890.0.0",
    ]) {
      expect(parseVersionParam(bad)).toBeNull();
    }
  });

  it("주소 만들기와 수정본 번호", () => {
    expect(versionHref("1.2.3")).toBe("/updates/v1.2.3");
    expect(historyHref("1.2.3")).toBe("/updates/v1.2.3/history");
    expect(revisionHref("1.2.3", 2)).toBe("/updates/v1.2.3/history/2");
    expect(parseRevisionNo("2")).toBe(2);
    expect(parseRevisionNo("0")).toBeNull();
    expect(parseRevisionNo("02")).toBeNull();
    expect(parseRevisionNo(undefined)).toBeNull();
  });

  it("plainTextExcerpt: 태그를 빼고 앞 150자(문자 단위)", () => {
    expect(
      plainTextExcerpt(
        '<h2 id="a">새 기능</h2><p>A &amp; B &lt;C&gt; &quot;d&quot; &#39;e&#39;&nbsp;f</p><script>x()</script>',
      ),
    ).toBe(`새 기능 A & B <C> "d" 'e' f`);
    expect(plainTextExcerpt(`<p>${"가".repeat(200)}</p>`)).toHaveLength(150);
    expect(plainTextExcerpt("<p>😀😀😀</p>", 2)).toBe("😀😀");
  });

  it("검색어는 2~100자", () => {
    expect(searchQueryError(" a ")).toEqual({ field: "q", code: "TOO_SHORT", params: { min: 2 } });
    expect(searchQueryError("ab")).toBeNull();
    expect(searchQueryError("가".repeat(101))).toEqual({
      field: "q",
      code: "TOO_LONG",
      params: { max: 100 },
    });
  });
});
