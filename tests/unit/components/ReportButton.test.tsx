// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ReportActionData } from "~/components/report/actions";
import { ReportButton } from "~/components/report/ReportButton";

import { renderRoutes } from "../support/render";

function renderButton(
  respond: (form: FormData) => ReportActionData | null,
  initialEntry = "/marco/123",
) {
  const submitted: FormData[] = [];
  renderRoutes(
    [
      {
        path: ":handle/:postId",
        action: async ({ request }) => {
          const form = await request.formData();
          submitted.push(form);
          return respond(form);
        },
        Component: () => (
          <>
            <ReportButton type="COMMENT" id={45} />
            <ReportButton type="POST" id={123} />
          </>
        ),
      },
    ],
    { initialEntries: [initialEntry] },
  );
  return submitted;
}

const reportForm = (name: string) => screen.getByRole("form", { name });

/** 신고 버튼·레이어(005 T043) */
describe("ReportButton", () => {
  it('닫힌 <details>의 "신고", 열면 사유 8개 라디오·설명·신고하기·취소·권리 침해 링크', async () => {
    renderButton(() => null);

    const [comment] = await screen.findAllByText("신고", { selector: "summary" });
    const details = comment.closest("details")!;
    expect(details).not.toHaveAttribute("open");
    const form = reportForm("댓글 신고");
    expect(within(form).getAllByRole("radio")).toHaveLength(8);
    expect(within(form).getByRole("radio", { name: "스팸·광고" })).toBeInTheDocument();
    expect(within(form).getByRole("radio", { name: "기타" })).toBeInTheDocument();
    expect(within(form).getByLabelText("설명")).toHaveAttribute("maxLength", "1000");
    expect(within(form).getByRole("button", { name: "신고하기" })).toBeInTheDocument();
    expect(within(form).getByRole("link", { name: "취소" })).toHaveAttribute("href", "/marco/123");
    expect(
      within(details).getByRole("link", { name: "회원이 아니신가요? 권리 침해 신고" }),
    ).toHaveAttribute("href", "/rights-request?url=%2Fmarco%2F123%23comment-45");
    expect(screen.getByRole("form", { name: "글 신고" })).toBeInTheDocument();
  });

  it("?report=comment-45로 들어오면(로그인 뒤 돌아옴) 그 대상만 열어 둔다, 취소는 ?report를 뺀 주소", async () => {
    renderButton(() => null, "/marco/123?report=comment-45&page=2");

    const form = await screen.findByRole("form", { name: "댓글 신고" });
    expect(form.closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("form", { name: "글 신고" }).closest("details")).not.toHaveAttribute(
      "open",
    );
    expect(within(form).getByRole("link", { name: "취소" })).toHaveAttribute(
      "href",
      "/marco/123?page=2",
    );
  });

  it("제출하면 intent=report와 대상·사유·설명, 접수되면 안내", async () => {
    const submitted = renderButton(() => ({ intent: "report", ok: true, key: "comment-45" }));

    const form = await screen.findByRole("form", { name: "댓글 신고" });
    fireEvent.click(within(form).getByRole("radio", { name: "욕설·괴롭힘" }));
    fireEvent.change(within(form).getByLabelText("설명"), { target: { value: "반복 욕설" } });
    fireEvent.click(within(form).getByRole("button", { name: "신고하기" }));

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(Object.fromEntries(submitted[0])).toEqual({
      intent: "report",
      targetType: "COMMENT",
      targetId: "45",
      reason: "ABUSE",
      detail: "반복 욕설",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("신고가 접수되었습니다.");
    // 다른 대상의 레이어는 그대로 닫혀 있다.
    expect(screen.getByRole("form", { name: "글 신고" }).closest("details")).not.toHaveAttribute(
      "open",
    );
  });

  it("이미 신고·대상 없음·요청 제한·설명 필수 문구", async () => {
    const responses: ReportActionData[] = [
      {
        intent: "report",
        ok: false,
        key: "post-123",
        resultCode: "REPORT_ALREADY_EXISTS",
        field: null,
        fieldErrors: [],
      },
      {
        intent: "report",
        ok: false,
        key: "post-123",
        resultCode: "REPORT_TARGET_NOT_FOUND",
        field: null,
        fieldErrors: [],
      },
      {
        intent: "report",
        ok: false,
        key: "post-123",
        resultCode: "TOO_MANY_REQUESTS",
        field: null,
        fieldErrors: [],
      },
      {
        intent: "report",
        ok: false,
        key: "post-123",
        resultCode: "VALIDATION_FAILED",
        field: null,
        fieldErrors: [{ field: "detail", code: "REQUIRED" }],
      },
    ];
    let index = 0;
    renderButton(() => responses[index++]);

    const expected = [
      "이미 신고한 콘텐츠입니다.",
      "신고할 콘텐츠를 찾을 수 없습니다.",
      "요청이 너무 많습니다",
    ];
    for (const message of expected) {
      const form = await screen.findByRole("form", { name: "글 신고" });
      fireEvent.click(within(form).getByRole("radio", { name: "스팸·광고" }));
      fireEvent.click(within(form).getByRole("button", { name: "신고하기" }));
      expect(await screen.findByText(new RegExp(message))).toBeInTheDocument();
    }
    const form = screen.getByRole("form", { name: "글 신고" });
    fireEvent.click(within(form).getByRole("radio", { name: "기타" }));
    fireEvent.click(within(form).getByRole("button", { name: "신고하기" }));
    expect(await within(form).findByText("필수 입력 항목입니다.")).toBeInTheDocument();
    expect(form.closest("details")).toHaveAttribute("open");
  });
});
