// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ClassificationReview,
  ClassificationStats,
  Setting,
  TopicMappingRule,
} from "~/api/models";
import { initialTopicId } from "~/components/external/ReviewTable";
import { batchItems, formInteger } from "~/external/forms.server";
import { percent } from "~/components/external/ClassificationStats";
import AdminExternalReviews, {
  REVIEW_BATCH_MAX,
  action as reviewsAction,
  loader as reviewsLoader,
  meta as reviewsMeta,
  reviewsHref,
} from "~/routes/admin/external-reviews";
import AdminExternalRules, {
  action as rulesAction,
  loader as rulesLoader,
  meta as rulesMeta,
  rulesHref,
} from "~/routes/admin/external-rules";
import AdminExternalSettings, {
  action as settingsAction,
  loader as settingsLoader,
  meta as settingsMeta,
  settingValue,
} from "~/routes/admin/external-settings";
import AdminExternalStats, {
  loader as statsLoader,
  meta as statsMeta,
} from "~/routes/admin/external-stats";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, failWithParams, mockBackend, ok } from "../support/backend";
import { externalTopics } from "../support/fixtures";
import { renderRoutes } from "../support/render";
import { asData, caught, formRequest, getRequest, routeArgs, statusOf } from "../support/route";

/** 007 T065: 콘솔 분류 검수·분류 현황·매핑 규칙·외부 블로그 설정 */
const TOPICS = "GET /api/v1/topics";
const REVIEWS = "GET /api/v1/admin/classification-reviews";
const CONFIRM_7 = "POST /api/v1/admin/classification-reviews/7/confirm";
const CONFIRM_BATCH = "POST /api/v1/admin/classification-reviews/confirm-batch";
const STATS = "GET /api/v1/admin/classification-stats";
const RULES = "GET /api/v1/admin/topic-mapping-rules";
const RULE_CREATE = "POST /api/v1/admin/topic-mapping-rules";
const RULE_PATCH_4 = "PATCH /api/v1/admin/topic-mapping-rules/4";
const RULE_DELETE_4 = "DELETE /api/v1/admin/topic-mapping-rules/4";
const SETTINGS = "GET /api/v1/admin/settings";
const SETTING_INTERVAL = "PUT /api/v1/admin/settings/external.fetch-interval";
const SETTING_WEIGHT_RESET = "DELETE /api/v1/admin/settings/external.score-weight";

type ReviewsArgs = Parameters<typeof reviewsLoader>[0];
type ReviewsActionArgs = Parameters<typeof reviewsAction>[0];
type RulesArgs = Parameters<typeof rulesLoader>[0];
type RulesActionArgs = Parameters<typeof rulesAction>[0];
type SettingsArgs = Parameters<typeof settingsLoader>[0];
type SettingsActionArgs = Parameters<typeof settingsAction>[0];
type StatsArgs = Parameters<typeof statsLoader>[0];

afterEach(() => {
  vi.restoreAllMocks();
});

function review(id: number, overrides: Partial<ClassificationReview> = {}): ClassificationReview {
  return {
    id,
    status: "PENDING",
    post: {
      id: id * 10,
      title: `Post ${id}`,
      summary: "요약",
      link: `https://remote.example/${id}`,
      feedTerms: ["java"],
      topicId: 11,
      topicSource: "DEFAULT",
    },
    externalBlog: { id: 3, title: "Remote", defaultTopicId: 11 },
    predictedTopicId: 12,
    confidence: 0.41,
    confirmedTopicId: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: "2026-10-06T00:00:00Z",
    ...overrides,
  };
}

function rule(id: number, overrides: Partial<TopicMappingRule> = {}): TopicMappingRule {
  return {
    id,
    keyword: "kotlin",
    topicId: 12,
    priority: 5,
    createdBy: { userId: 1, nickname: "운영자" },
    createdAt: "2026-10-06T00:00:00Z",
    updatedAt: "2026-10-06T00:00:00Z",
    ...overrides,
  };
}

function stats(overrides: Partial<ClassificationStats> = {}): ClassificationStats {
  return {
    window: { from: "2026-09-07T00:00:00Z", to: "2026-10-07T00:00:00Z" },
    classifierAccuracy: { sample: 8, correct: 6, rate: 0.75 },
    finalAccuracy: { sample: 0, unchanged: 0, rate: null },
    distribution: [
      { topicId: 11, total: 5, bySource: { OWNER: 1, REVIEW: 1, RULE: 0, AUTO: 2, DEFAULT: 1 } },
      { topicId: 12, total: 2, bySource: { OWNER: 0, REVIEW: 0, RULE: 2, AUTO: 0, DEFAULT: 0 } },
    ],
    pendingReviews: 3,
    minConfidence: 0.6,
    classifierVersion: "kw-2026-10",
    generatedAt: "2026-10-07T00:00:00Z",
    ...overrides,
  };
}

function setting(key: string, value: unknown, defaultValue: unknown, overridden = false): Setting {
  return {
    key,
    value,
    defaultValue,
    overridden,
    updatedBy: overridden ? { userId: 1, nickname: "운영자" } : null,
    updatedAt: overridden ? "2026-10-06T00:00:00Z" : null,
  };
}

describe("분류 검수", () => {
  it("loader: 상태(기본 검수 대기)·블로그·쪽, 관리자가 아니면 404", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [REVIEWS]: ok([review(7)], { totalCount: 41 }),
      [TOPICS]: ok(externalTopics()),
    });
    const data = await reviewsLoader(
      routeArgs<ReviewsArgs>(
        getRequest("/admin/external-blogs/reviews?status=NOPE&externalBlogId=3&page=2", loggedIn),
      ),
    );
    expect(data).toMatchObject({ status: "PENDING", blogId: 3, page: 2, totalCount: 41 });
    const query = backend.callsTo(REVIEWS)[0].url.searchParams;
    expect(query.get("status")).toBe("PENDING");
    expect(query.get("externalBlogId")).toBe("3");
    expect(query.get("page")).toBe("1");

    await reviewsLoader(
      routeArgs<ReviewsArgs>(
        getRequest("/admin/external-blogs/reviews?status=CONFIRMED&externalBlogId=x", loggedIn),
      ),
    );
    expect(backend.callsTo(REVIEWS)[1].url.searchParams.get("status")).toBe("CONFIRMED");
    expect(backend.callsTo(REVIEWS)[1].url.searchParams.has("externalBlogId")).toBe(false);

    mockBackend({ [ME]: ok(member("USER")) });
    expect(
      statusOf(
        await caught(
          reviewsLoader(
            routeArgs<ReviewsArgs>(getRequest("/admin/external-blogs/reviews", loggedIn)),
          ),
        ),
      ),
    ).toBe(404);
  });

  it("주소 도우미·meta·처음 확정 주제(예측, 없으면 지금 주제)", () => {
    expect(reviewsHref("PENDING", null)).toBe("/admin/external-blogs/reviews");
    expect(reviewsHref("SKIPPED", 3, 2)).toBe(
      "/admin/external-blogs/reviews?status=SKIPPED&externalBlogId=3&page=2",
    );
    expect(reviewsMeta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
    expect(initialTopicId(review(1))).toBe(12);
    expect(initialTopicId(review(1, { predictedTopicId: null }))).toBe(11);
  });

  it("batchItems: 고른 줄만, 같은 id는 한 번, 주제가 비면 오류", () => {
    const form = new FormData();
    form.append("selected", "7");
    form.append("selected", "7");
    form.append("selected", "8");
    form.append("selected", "x");
    form.set("topic-7", "12");
    form.set("topic-8", "11");
    form.set("topic-9", "11");
    expect(batchItems(form)).toEqual([
      { id: 7, topicId: 12 },
      { id: 8, topicId: 11 },
    ]);
    form.delete("topic-8");
    expect(() => batchItems(form)).toThrow();
  });

  it("action: 한 건 확정, 일괄 확정(빈 선택·한도), 이미 처리된 검수는 409", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [CONFIRM_7]: ok(review(7, { status: "CONFIRMED", confirmedTopicId: 12 })),
      [CONFIRM_BATCH]: ok({ confirmed: [7], skipped: [{ id: 8, status: "NOT_FOUND" }] }),
    });
    const call = (fields: Record<string, string> | URLSearchParams) =>
      reviewsAction(
        routeArgs<ReviewsActionArgs>(
          new Request("http://front.test/admin/external-blogs/reviews", {
            method: "POST",
            body: fields instanceof URLSearchParams ? fields : new URLSearchParams(fields),
            headers: { origin: "http://front.test", ...loggedIn },
          }),
        ),
      );
    expect(await call({ intent: "confirm:7", "topic-7": "12" })).toEqual({
      intent: "confirm",
      ok: true,
      batch: null,
    });
    expect(backend.callsTo(CONFIRM_7)[0].body).toEqual({ topicId: 12 });
    expect(asData(await call({ intent: "confirm:7" })).init?.status).toBe(400);

    expect(await call({ intent: "confirm-batch" })).toMatchObject({ ok: false, limit: "empty" });
    const many = new URLSearchParams({ intent: "confirm-batch" });
    for (let id = 1; id <= REVIEW_BATCH_MAX + 1; id++) {
      many.append("selected", String(id));
      many.append(`topic-${id}`, "11");
    }
    expect(await call(many)).toMatchObject({ ok: false, limit: "max" });
    expect(backend.callsTo(CONFIRM_BATCH)).toHaveLength(0);

    const batch = new URLSearchParams({
      intent: "confirm-batch",
      "topic-7": "12",
      "topic-8": "11",
    });
    batch.append("selected", "7");
    batch.append("selected", "8");
    expect(await call(batch)).toMatchObject({ ok: true, batch: { confirmed: [7] } });
    expect(backend.callsTo(CONFIRM_BATCH)[0].body).toEqual({
      items: [
        { id: 7, topicId: 12 },
        { id: 8, topicId: 11 },
      ],
    });

    mockBackend({
      [ME]: ok(member()),
      [CONFIRM_7]: fail(409, "CLASSIFICATION_REVIEW_CLOSED"),
    });
    expect(asData(await call({ intent: "confirm:7", "topic-7": "12" })).init?.status).toBe(409);
    expect(asData(await call({ intent: "nope" })).init?.status).toBe(400);
  });

  function renderReviews(path = "/admin/external-blogs/reviews", extra = {}) {
    const backend = mockBackend({
      [ME]: ok(member()),
      [TOPICS]: ok(externalTopics()),
      ...extra,
    });
    renderRoutes(
      [
        {
          path: "admin/external-blogs/reviews",
          loader: stub(reviewsLoader),
          action: stub(reviewsAction),
          Component: AdminExternalReviews,
        },
      ],
      { initialEntries: [path] },
    );
    return backend;
  }

  it("검수 대기 표: 예측·신뢰도·지금 주제, 처음 값은 예측, 확정하면 안내", async () => {
    const backend = renderReviews(undefined, {
      [REVIEWS]: ok([review(7), review(8, { predictedTopicId: null, confidence: null })], {
        totalCount: 2,
      }),
      [CONFIRM_7]: ok(review(7, { status: "CONFIRMED" })),
    });
    const table = await screen.findByRole("table", { name: "분류 검수" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("knowledge 한 › science 한");
    expect(rows[0]).toHaveTextContent("신뢰도 0.41");
    expect(rows[0]).toHaveTextContent("피드 태그: java");
    expect(rows[1]).toHaveTextContent("없음");
    expect(within(rows[0]).getByLabelText("Post 7 확정 주제")).toHaveValue("12");
    expect(within(rows[1]).getByLabelText("Post 8 확정 주제")).toHaveValue("11");
    expect(screen.getByRole("link", { name: "검수 대기" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "확정" }));
    expect(await screen.findByText("확정했습니다.")).toBeInTheDocument();
    expect(backend.callsTo(CONFIRM_7)[0].body).toEqual({ topicId: 12 });
  });

  it("일괄 확정 결과와 이미 처리된 검수 문구", async () => {
    renderReviews(undefined, {
      [REVIEWS]: ok([review(7), review(8)], { totalCount: 2 }),
      [CONFIRM_BATCH]: ok({ confirmed: [7], skipped: [{ id: 8, status: "CONFIRMED" }] }),
      [CONFIRM_7]: fail(409, "CLASSIFICATION_REVIEW_CLOSED"),
    });
    const table = await screen.findByRole("table", { name: "분류 검수" });
    fireEvent.click(within(table).getByLabelText("Post 7 선택"));
    fireEvent.click(within(table).getByLabelText("Post 8 선택"));
    fireEvent.click(screen.getByRole("button", { name: "선택한 글 일괄 확정" }));
    expect(
      await screen.findByText("1건 확정, 1건은 이미 처리되어 건너뛰었습니다."),
    ).toBeInTheDocument();
    fireEvent.click(within(table).getAllByRole("button", { name: "확정" })[0]);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("빈 선택 안내, 처리된 목록은 확정 주제·검수자, 블로그 필터", async () => {
    renderReviews("/admin/external-blogs/reviews?status=CONFIRMED&externalBlogId=3", {
      [REVIEWS]: ok(
        [
          review(7, {
            status: "CONFIRMED",
            confirmedTopicId: 12,
            reviewedBy: { userId: 1, nickname: "운영자" },
            reviewedAt: "2026-10-07T00:00:00Z",
          }),
          review(8, { status: "SKIPPED" }),
        ],
        { totalCount: 2 },
      ),
    });
    const table = await screen.findByRole("table", { name: "분류 검수" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("검수자: 운영자");
    expect(rows[1]).toHaveTextContent("건너뜀");
    expect(within(table).queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(/블로그 #3만 보는 중/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "모든 블로그 보기" })).toHaveAttribute(
      "href",
      "/admin/external-blogs/reviews?status=CONFIRMED",
    );
  });

  it("빈 목록과 빈 일괄 선택", async () => {
    renderReviews(undefined, { [REVIEWS]: ok([review(7)], { totalCount: 1 }) });
    fireEvent.click(await screen.findByRole("button", { name: "선택한 글 일괄 확정" }));
    expect(await screen.findByText("확정할 글을 고르세요.")).toBeInTheDocument();
  });

  it("검수할 글이 없으면 안내", async () => {
    renderReviews(undefined, { [REVIEWS]: ok([], { totalCount: 0 }) });
    expect(await screen.findByText("검수할 글이 없습니다.")).toBeInTheDocument();
  });
});

describe("분류 현황", () => {
  it("정확도·표본·정의, 표본 0이면 —, 분포 표와 막대", async () => {
    mockBackend({
      [ME]: ok(member()),
      [STATS]: ok(stats()),
      [TOPICS]: ok(externalTopics()),
    });
    renderRoutes(
      [
        {
          path: "admin/external-blogs/stats",
          loader: stub(statsLoader),
          Component: AdminExternalStats,
        },
      ],
      { initialEntries: ["/admin/external-blogs/stats"] },
    );
    expect(await screen.findByTestId("stats-classifier")).toHaveTextContent("75.0%");
    expect(screen.getByText("표본 8건")).toBeInTheDocument();
    expect(screen.getByTestId("stats-final")).toHaveTextContent("—");
    expect(screen.getByText("표본 없음")).toBeInTheDocument();
    expect(
      screen.getByText("주인이나 검수가 주제를 정한 글 중 자동 분류 예측이 최종 주제와 같은 비율"),
    ).toBeInTheDocument();
    expect(screen.getByText(/검수 대기 3건/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "검수하러 가기" })).toHaveAttribute(
      "href",
      "/admin/external-blogs/reviews",
    );
    const table = screen.getByRole("table", { name: "주제별 외부 글 수(출처별)" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("knowledge 한 › it 한");
    expect(rows[0].querySelectorAll("rect")).toHaveLength(5);
    expect(rows[1].querySelector("rect[class='stats-bar-rule']")?.getAttribute("width")).toBe(
      String((2 / 5) * 240),
    );
    expect(screen.getByText("kw-2026-10")).toBeInTheDocument();
  });

  it("분포가 없으면 표본 없음, loader는 관리자만, meta", async () => {
    mockBackend({
      [ME]: ok(member()),
      [STATS]: ok(stats({ distribution: [] })),
      [TOPICS]: fail(500, "INTERNAL_ERROR"),
    });
    const data = await statsLoader(
      routeArgs<StatsArgs>(getRequest("/admin/external-blogs/stats", loggedIn)),
    );
    expect(data.topics).toEqual([]);
    expect(statsMeta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
    expect(percent(null)).toBeNull();
    expect(percent(0.12345)).toBe("12.3");
    expect(percent(1)).toBe("100.0");
  });
});

describe("매핑 규칙", () => {
  function renderRules(extra = {}) {
    const backend = mockBackend({
      [ME]: ok(member()),
      [RULES]: ok([rule(4)], { totalCount: 1 }),
      [TOPICS]: ok(externalTopics()),
      ...extra,
    });
    renderRoutes(
      [
        {
          path: "admin/external-blogs/rules",
          loader: stub(rulesLoader),
          action: stub(rulesAction),
          Component: AdminExternalRules,
        },
      ],
      { initialEntries: ["/admin/external-blogs/rules"] },
    );
    return backend;
  }

  it("loader: 검색어·쪽, 주소 도우미·meta·정수 값", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [RULES]: ok([rule(4)], { totalCount: 1 }),
      [TOPICS]: ok(externalTopics()),
    });
    const data = await rulesLoader(
      routeArgs<RulesArgs>(getRequest("/admin/external-blogs/rules?q=%20kot%20&page=2", loggedIn)),
    );
    expect(data).toMatchObject({ q: "kot", page: 2, totalCount: 1 });
    expect(backend.callsTo(RULES)[0].url.searchParams.get("q")).toBe("kot");
    expect(rulesHref("", 1)).toBe("/admin/external-blogs/rules");
    expect(rulesHref("k", 2)).toBe("/admin/external-blogs/rules?q=k&page=2");
    expect(rulesMeta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
    const form = new FormData();
    form.set("a", "-5");
    form.set("b", "1.5");
    expect(formInteger(form, "a", 0)).toBe(-5);
    expect(formInteger(form, "b", 0)).toBeNull();
    expect(formInteger(form, "c", 7)).toBe(7);
  });

  it("action: 추가·수정·삭제, 입력 검사, 잘못된 intent", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [RULE_CREATE]: ok(rule(5), { status: 201 }),
      [RULE_PATCH_4]: ok(rule(4)),
      [RULE_DELETE_4]: ok(null),
    });
    const call = (fields: Record<string, string>) =>
      rulesAction(
        routeArgs<RulesActionArgs>(formRequest("/admin/external-blogs/rules", fields, loggedIn)),
      );
    expect(
      await call({ intent: "create", keyword: " Kotlin ", topicId: "12", priority: "" }),
    ).toEqual({ intent: "create", ok: true, id: null });
    expect(backend.callsTo(RULE_CREATE)[0].body).toEqual({
      keyword: "Kotlin",
      topicId: 12,
      priority: 0,
    });
    expect(
      await call({ intent: "update", id: "4", keyword: "k", topicId: "11", priority: "-3" }),
    ).toEqual({ intent: "update", ok: true, id: 4 });
    expect(backend.callsTo(RULE_PATCH_4)[0].body).toEqual({
      keyword: "k",
      topicId: 11,
      priority: -3,
    });
    expect(await call({ intent: "delete", id: "4" })).toEqual({
      intent: "delete",
      ok: true,
      id: 4,
    });
    expect(asData(await call({ intent: "create", topicId: "12" })).init?.status).toBe(400);
    expect(asData(await call({ intent: "create", keyword: "k" })).init?.status).toBe(400);
    expect(
      asData(await call({ intent: "create", keyword: "k", topicId: "12", priority: "x" })).init
        ?.status,
    ).toBe(400);
    expect(asData(await call({ intent: "update", keyword: "k" })).init?.status).toBe(400);
    expect(asData(await call({ intent: "delete" })).init?.status).toBe(400);
    expect(asData(await call({ intent: "nope" })).init?.status).toBe(400);
  });

  it("표·안내, 추가하면 안내, 중복 키워드는 기존 규칙 번호", async () => {
    const backend = renderRules({
      [RULE_CREATE]: failWithParams(409, "TOPIC_MAPPING_RULE_KEYWORD_TAKEN", { ruleId: 4 }),
      [RULE_DELETE_4]: ok(null),
    });
    const table = await screen.findByRole("table", { name: "매핑 규칙" });
    expect(table).toHaveTextContent("kotlin");
    expect(table).toHaveTextContent("knowledge 한 › science 한");
    expect(table).toHaveTextContent("운영자");
    expect(screen.getByText("규칙은 이후 수집되는 글에만 적용됩니다.")).toBeInTheDocument();

    const add = screen.getByRole("form", { name: "규칙 추가" });
    fireEvent.change(within(add).getByLabelText("키워드"), { target: { value: "kotlin" } });
    fireEvent.change(within(add).getByLabelText("주제"), { target: { value: "12" } });
    fireEvent.click(within(add).getByRole("button", { name: "규칙 추가" }));
    expect(await screen.findByText(/같은 키워드의 규칙 #4이 있습니다/)).toBeInTheDocument();

    fireEvent.click(within(table).getByRole("button", { name: "삭제 kotlin" }));
    expect(await screen.findByText("규칙을 삭제했습니다.")).toBeInTheDocument();
    expect(backend.callsTo(RULE_DELETE_4)).toHaveLength(1);
  });

  it("줄의 수정 폼 입력 오류는 그 줄에", async () => {
    renderRules({
      [RULE_PATCH_4]: failWithParams(400, "VALIDATION_FAILED", {}),
    });
    const form = await screen.findByRole("form", { name: "kotlin 규칙 수정" });
    expect(within(form).getByLabelText("우선순위")).toHaveValue(5);
    fireEvent.click(within(form).getByRole("button", { name: "수정" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("규칙이 없으면 안내", async () => {
    renderRules({ [RULES]: ok([], { totalCount: 0 }) });
    expect(await screen.findByText("규칙이 없습니다.")).toBeInTheDocument();
  });
});

describe("외부 블로그 설정", () => {
  const settingsList = () => [
    setting("external.fetch-interval", "PT30M", "PT30M"),
    setting("external.auto-classify-min-confidence", 0.6, 0.6),
    setting("external.score-weight", 0.5, 1, true),
  ];

  it("loader는 external. 접두어, 값 변환, meta", async () => {
    const backend = mockBackend({ [ME]: ok(member()), [SETTINGS]: ok(settingsList()) });
    const data = await settingsLoader(
      routeArgs<SettingsArgs>(getRequest("/admin/external-blogs/settings", loggedIn)),
    );
    expect(data.settings).toHaveLength(3);
    expect(backend.callsTo(SETTINGS)[0].url.searchParams.get("prefix")).toBe("external.");
    expect(settingValue("external.fetch-interval", " pt1h ")).toBe("PT1H");
    expect(settingValue("external.score-weight", "2.5")).toBe(2.5);
    expect(settingValue("external.score-weight", "x")).toBeNull();
    expect(settingValue("external.score-weight", "")).toBeNull();
    expect(settingsMeta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("action: 저장·기본값으로, 잘못된 키·값은 400, backend 검사 오류", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [SETTING_INTERVAL]: (request) =>
        (request.body as { value: string }).value === "PT1M"
          ? failWithParams(400, "VALIDATION_FAILED", {})
          : ok(setting("external.fetch-interval", "PT1H", "PT30M", true)),
      [SETTING_WEIGHT_RESET]: ok(null),
    });
    const call = (fields: Record<string, string>) =>
      settingsAction(
        routeArgs<SettingsActionArgs>(
          formRequest("/admin/external-blogs/settings", fields, loggedIn),
        ),
      );
    expect(
      asData(await call({ intent: "save", key: "external.fetch-interval", value: "pt1h" })).data,
    ).toEqual({ intent: "save", ok: true, key: "external.fetch-interval" });
    expect(backend.callsTo(SETTING_INTERVAL)[0].body).toEqual({ value: "PT1H" });
    expect(
      asData(await call({ intent: "reset", key: "external.score-weight" })).data,
    ).toMatchObject({ ok: true });
    expect(backend.callsTo(SETTING_WEIGHT_RESET)).toHaveLength(1);
    expect(asData(await call({ intent: "save", key: "portal.x", value: "1" })).init?.status).toBe(
      400,
    );
    expect(
      asData(await call({ intent: "save", key: "external.score-weight", value: "" })).init?.status,
    ).toBe(400);
    expect(
      asData(await call({ intent: "save", key: "external.fetch-interval", value: "PT1M" })).init
        ?.status,
    ).toBe(400);
  });

  it("세 설정·기본값·바꾼 사람, 기본값으로 버튼은 바뀐 설정만", async () => {
    mockBackend({
      [ME]: ok(member()),
      [SETTINGS]: ok(settingsList()),
      [SETTING_WEIGHT_RESET]: ok(null),
    });
    renderRoutes(
      [
        {
          path: "admin/external-blogs/settings",
          loader: stub(settingsLoader),
          action: stub(settingsAction),
          Component: AdminExternalSettings,
        },
      ],
      { initialEntries: ["/admin/external-blogs/settings"] },
    );
    const interval = await screen.findByRole("region", { name: "수집 주기" });
    expect(within(interval).getByLabelText("수집 주기")).toHaveValue("PT30M");
    expect(within(interval).queryByRole("button", { name: "기본값으로" })).toBeNull();
    const weight = screen.getByRole("region", { name: "외부 글 인기 점수 가중치" });
    expect(weight).toHaveTextContent("기본값: 1");
    expect(weight).toHaveTextContent("운영자");
    fireEvent.click(within(weight).getByRole("button", { name: "기본값으로" }));
    expect(await within(weight).findByText("기본값으로 되돌렸습니다.")).toBeInTheDocument();
  });
});
