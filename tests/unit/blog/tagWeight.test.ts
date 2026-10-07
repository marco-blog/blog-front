import { describe, expect, it } from "vitest";

import { tagWeight, withTagWeights } from "~/blog/tagWeight";

describe("태그 크기 단계(tagWeight)", () => {
  it("가장 적은 태그는 1, 가장 많은 태그는 5(로그 눈금)", () => {
    expect(tagWeight(1, 1, 100)).toBe(1);
    expect(tagWeight(100, 1, 100)).toBe(5);
    expect(tagWeight(10, 1, 100)).toBe(3);
    expect(tagWeight(3, 1, 100)).toBe(2);
    expect(tagWeight(32, 1, 100)).toBe(4);
  });

  it("모두 같으면 3", () => {
    expect(tagWeight(4, 4, 4)).toBe(3);
    expect(withTagWeights([{ postCount: 2 }, { postCount: 2 }]).map((tag) => tag.weight)).toEqual([
      3, 3,
    ]);
  });

  it("범위를 벗어난 값은 끝 단계로", () => {
    expect(tagWeight(500, 1, 100)).toBe(5);
    expect(tagWeight(0, 1, 100)).toBe(3);
  });

  it("목록에 단계를 붙인다", () => {
    expect(
      withTagWeights([
        { name: "a", postCount: 1 },
        { name: "b", postCount: 14 },
      ]),
    ).toEqual([
      { name: "a", postCount: 1, weight: 1 },
      { name: "b", postCount: 14, weight: 5 },
    ]);
  });
});
