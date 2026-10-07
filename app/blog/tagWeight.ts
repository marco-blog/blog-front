/** 태그 크기 단계 수(004 FR-061, 블로그 태그 목록·사이드바 태그) */
export const TAG_WEIGHT_LEVELS = 5;

/**
 * 글 수를 1~5단계로 바꾼다(로그 눈금: 글 수가 몇 배 많을수록 한 단계씩). 가장 적은 태그가 1, 가장 많은 태그가 5,
 * 모두 같으면 가운데(3).
 */
export function tagWeight(count: number, min: number, max: number): number {
  if (max <= min || count <= 0) {
    return Math.ceil(TAG_WEIGHT_LEVELS / 2);
  }
  const low = Math.log(Math.max(min, 1));
  const high = Math.log(max);
  const ratio = (Math.log(Math.min(Math.max(count, min), max)) - low) / (high - low);
  return 1 + Math.round(ratio * (TAG_WEIGHT_LEVELS - 1));
}

/** 태그 목록에 단계를 붙인다. */
export function withTagWeights<T extends { postCount: number }>(
  tags: readonly T[],
): (T & { weight: number })[] {
  const counts = tags.map((tag) => tag.postCount);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return tags.map((tag) => ({ ...tag, weight: tagWeight(tag.postCount, min, max) }));
}
