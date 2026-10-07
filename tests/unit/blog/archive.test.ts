import { describe, expect, it } from "vitest";

import { archiveHref, formatYearMonth, parseYearMonth } from "~/blog/archive";

describe("월별 보관함 주소(archive)", () => {
  it("/:handle/archive/2026/10, 2쪽부터 page", () => {
    expect(archiveHref("marco", { year: 2026, month: 10 })).toBe("/marco/archive/2026/10");
    expect(archiveHref("marco", { year: 2026, month: 9 }, 2)).toBe("/marco/archive/2026/9?page=2");
  });

  it("연·월을 검사한다", () => {
    expect(parseYearMonth("2026", "10")).toEqual({ year: 2026, month: 10 });
    expect(parseYearMonth("2026", "09")).toEqual({ year: 2026, month: 9 });
    for (const [year, month] of [
      ["2026", "13"],
      ["2026", "0"],
      ["1969", "1"],
      ["10000", "1"],
      ["abcd", "1"],
      ["2026", "1a"],
      ["2026", undefined],
      [undefined, "1"],
      ["2026", "100"],
    ]) {
      expect(parseYearMonth(year, month)).toBeNull();
    }
  });

  it("화면 언어의 연·월 표기", () => {
    const value = { year: 2026, month: 10 };
    expect(formatYearMonth(value, "ko")).toBe("2026년 10월");
    expect(formatYearMonth(value, "en")).toBe("October 2026");
    expect(formatYearMonth(value, "ja")).toBe("2026年10月");
    expect(formatYearMonth(value, "zh-CN")).toBe("2026年10月");
  });
});
