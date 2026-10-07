import type { AdminUserDetail, ReportDetail, ReportGroup, ReportTargetPreview } from "~/api/models";

/** 005 관리자 화면 시험의 공통 값 */
export const preview = (overrides: Partial<ReportTargetPreview> = {}): ReportTargetPreview => ({
  type: "POST",
  id: 123,
  state: "ACTIVE",
  title: "광고 글",
  text: "싸게 팝니다",
  url: "https://blog.java21.net/marco/123",
  author: { userId: 7, nickname: "마르코", guest: false },
  blog: { handle: "marco", title: "마르코의 블로그" },
  ...overrides,
});

export const group = (overrides: Partial<ReportGroup> = {}): ReportGroup => ({
  representativeId: 11,
  targetType: "POST",
  targetId: 123,
  channel: "MEMBER",
  reportCount: 3,
  reasons: [
    { reason: "SPAM", count: 2 },
    { reason: "ABUSE", count: 1 },
  ],
  firstReportedAt: "2026-10-05T01:00:00Z",
  lastReportedAt: "2026-10-06T01:00:00Z",
  status: "PENDING",
  action: null,
  target: preview(),
  ...overrides,
});

export const reportDetail = (overrides: Partial<ReportDetail> = {}): ReportDetail => ({
  id: 11,
  channel: "MEMBER",
  status: "PENDING",
  action: null,
  resolutionNote: null,
  handledBy: null,
  handledAt: null,
  targetUrl: null,
  rightsBasis: null,
  contactEmail: null,
  target: preview(),
  reports: [
    {
      id: 11,
      channel: "MEMBER",
      reporter: { id: 2, nickname: "독자" },
      reason: "SPAM",
      detail: "<b>광고</b>입니다",
      createdAt: "2026-10-05T01:00:00Z",
    },
  ],
  targetUserReportCount: 4,
  ...overrides,
});

export const userDetail = (overrides: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
  id: 7,
  nickname: "마르코",
  status: "ACTIVE",
  role: "USER",
  createdAt: "2026-01-02T00:00:00Z",
  blogCount: 1,
  postCount: 12,
  receivedReportCount: 3,
  lastLoginAt: "2026-10-06T00:00:00Z",
  blogs: [
    { handle: "marco", title: "마르코의 블로그", status: "ACTIVE" },
    { handle: "old", title: "옛 블로그", status: "DELETED" },
  ],
  blogLimit: { current: 1, limit: 3, custom: false },
  ...overrides,
});
