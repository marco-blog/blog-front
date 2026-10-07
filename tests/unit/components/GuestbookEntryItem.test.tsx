// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GuestbookEntry } from "~/api/models";
import type { GuestbookActionData } from "~/components/guestbook/actions";
import { GuestbookList } from "~/components/guestbook/GuestbookList";

import { renderRoutes } from "../support/render";

function entry(id: number, overrides: Partial<GuestbookEntry> = {}): GuestbookEntry {
  return {
    id,
    content: `방명록 ${id}`,
    secret: false,
    deleted: false,
    author: { userId: 42, nickname: "리더", profileImageUrl: null, guest: false },
    createdAt: "2026-10-06T04:24:19Z",
    updatedAt: "2026-10-06T04:24:19Z",
    replies: [],
    ...overrides,
  };
}

const guestAuthor = { userId: null, nickname: "지나가던 사람", profileImageUrl: null, guest: true };

function renderList(
  entries: GuestbookEntry[],
  {
    viewerId = null,
    isOwner = false,
    result,
    reportable = false,
  }: {
    viewerId?: number | null;
    isOwner?: boolean;
    result?: GuestbookActionData;
    reportable?: boolean;
  } = {},
) {
  const actions: FormData[] = [];
  renderRoutes(
    [
      {
        path: "gb",
        action: async ({ request }) => {
          actions.push(await request.formData());
          return null;
        },
        Component: () => (
          <GuestbookList
            entries={entries}
            viewerId={viewerId}
            isOwner={isOwner}
            result={result}
            reportable={reportable}
          />
        ),
      },
    ],
    { initialEntries: ["/gb"] },
  );
  return actions;
}

describe("방명록 글", () => {
  it("볼 수 없는 비밀글은 '비밀글입니다'와 자물쇠, 비회원은 '비회원' 표시", async () => {
    renderList([entry(1, { secret: true, content: null }), entry(2, { author: guestAuthor })]);

    const list = await screen.findByRole("list", { name: "방명록 글 목록" });
    const [secret, guest] = within(list).getAllByRole("article");
    expect(secret).toHaveTextContent("비밀글입니다.");
    expect(secret).toHaveTextContent("🔒 비밀글");
    expect(guest).toHaveTextContent("지나가던 사람");
    expect(guest).toHaveTextContent("비회원");
    expect(secret).not.toHaveTextContent("비회원");
  });

  it("주인·작성자는 비밀글 내용을 본다(응답에 내용이 있으면 그대로)", async () => {
    renderList([entry(1, { secret: true, content: "비밀 이야기" })], { viewerId: 42 });
    expect(await screen.findByText("비밀 이야기", { selector: "p" })).toBeInTheDocument();
  });

  it("삭제된 자리는 '삭제된 글입니다'와 남은 답글", async () => {
    renderList([
      entry(1, {
        deleted: true,
        content: null,
        author: null,
        replies: [
          entry(2, {
            content: "주인 답글",
            author: { userId: 1, nickname: "마르코", profileImageUrl: null, guest: false },
          }),
        ],
      }),
    ]);

    expect(await screen.findByText("삭제된 글입니다.")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "답글" })).toHaveTextContent("주인 답글");
  });

  it("내용은 이스케이프한다(<script>가 텍스트로)", async () => {
    const { container } = { container: document.body };
    renderList([entry(1, { content: "<script>alert(1)</script>" })]);

    expect(await screen.findByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("주인에게만 답글 폼, 답글에는 답글 폼 없음", async () => {
    renderList(
      [
        entry(1, {
          replies: [
            entry(2, {
              author: { userId: 1, nickname: "마르코", profileImageUrl: null, guest: false },
            }),
          ],
        }),
      ],
      {
        viewerId: 1,
        isOwner: true,
      },
    );

    expect(await screen.findAllByText("답글 달기")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "삭제" })).toHaveLength(2);
  });

  it("다른 회원에게는 답글·수정·삭제가 없다", async () => {
    renderList([entry(1)], { viewerId: 7 });

    await screen.findByRole("article");
    expect(screen.queryByText("답글 달기")).toBeNull();
    expect(screen.queryByText("수정")).toBeNull();
    expect(screen.queryByRole("button", { name: "삭제" })).toBeNull();
  });

  it("작성 회원은 수정(내용·비밀글 채움)과 삭제, 삭제는 한 번 더 묻는다", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const actions = renderList([entry(1, { secret: true, content: "내 글" })], { viewerId: 42 });

    const edit = await screen.findByRole("form", { name: "방명록 글 고치기" });
    expect(within(edit).getByLabelText("고칠 내용")).toHaveValue("내 글");
    expect(within(edit).getByLabelText("비밀글 (블로그 주인과 나만 보기)")).toBeChecked();
    expect(within(edit).queryByLabelText("작성할 때 입력한 비밀번호")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(confirm).toHaveBeenCalledWith("이 방명록 글을 삭제할까요?");
    await vi.waitFor(() => expect(actions).toHaveLength(1));
    expect(Object.fromEntries(actions[0])).toMatchObject({ intent: "delete", entryId: "1" });
    confirm.mockRestore();
  });

  it("삭제를 취소하면 보내지 않는다", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const actions = renderList([entry(1)], { viewerId: 42 });

    fireEvent.click(await screen.findByRole("button", { name: "삭제" }));
    expect(actions).toHaveLength(0);
    confirm.mockRestore();
  });

  it("비회원 글은 비로그인 방문자가 비밀번호로 수정·삭제한다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const actions = renderList([entry(1, { author: guestAuthor, content: "비회원 글" })]);

    const edit = await screen.findByRole("form", { name: "방명록 글 고치기" });
    expect(within(edit).getByLabelText("작성할 때 입력한 비밀번호")).toHaveAttribute(
      "type",
      "password",
    );
    const deleteForm = screen.getByRole("button", { name: "삭제" }).closest("form")!;
    fireEvent.change(within(deleteForm).getByLabelText("작성할 때 입력한 비밀번호"), {
      target: { value: "1234" },
    });
    fireEvent.click(within(deleteForm).getByRole("button", { name: "삭제" }));
    await vi.waitFor(() => expect(actions).toHaveLength(1));
    expect(Object.fromEntries(actions[0])).toMatchObject({
      intent: "delete",
      entryId: "1",
      guestPassword: "1234",
    });
    vi.restoreAllMocks();
  });

  it("비회원 비밀글은 비밀번호로 먼저 열고, 열리면 내용을 채운 수정 폼", async () => {
    renderList([entry(1, { author: guestAuthor, secret: true, content: null })]);
    const unlock = await screen.findByRole("form", { name: "비밀글 열기" });
    expect(within(unlock).getByLabelText("작성할 때 입력한 비밀번호")).toBeInTheDocument();
  });

  it("열기 결과가 오면 내용을 채운 수정 폼, 틀린 비밀번호는 칸 아래 문구", async () => {
    renderList([entry(1, { author: guestAuthor, secret: true, content: null })], {
      result: {
        intent: "unlock",
        target: "unlock-1",
        ok: true,
        entry: entry(1, { content: "열린 내용" }),
      },
    });
    const edit = await screen.findByRole("form", { name: "방명록 글 고치기" });
    expect(within(edit).getByLabelText("고칠 내용")).toHaveValue("열린 내용");
  });

  it("틀린 비밀번호는 비밀번호 칸 아래에", async () => {
    renderList([entry(1, { author: guestAuthor, secret: true, content: null })], {
      result: {
        intent: "unlock",
        target: "unlock-1",
        ok: false,
        resultCode: "GUEST_PASSWORD_MISMATCH",
        field: "guestPassword",
        fieldErrors: [],
      },
    });
    expect(await screen.findByText("비밀번호가 맞지 않습니다.")).toBeInTheDocument();
  });

  it("로그인 회원에게는 비회원 글의 수정·삭제가 없다(주인은 비밀번호 없이 삭제)", async () => {
    renderList([entry(1, { author: guestAuthor })], { viewerId: 1, isOwner: true });

    await screen.findByRole("article");
    expect(screen.queryByLabelText("작성할 때 입력한 비밀번호")).toBeNull();
    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
  });

  it("삭제 실패(회원)는 글 위 오류 문구", async () => {
    renderList([entry(1)], {
      viewerId: 42,
      result: {
        intent: "delete",
        target: "delete-1",
        ok: false,
        resultCode: "FORBIDDEN",
        field: null,
        fieldErrors: [],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("이 작업을 할 권한이 없습니다.");
  });

  it("빈 목록 안내", async () => {
    renderList([]);
    expect(await screen.findByText("아직 방명록에 남긴 글이 없습니다.")).toBeInTheDocument();
  });

  it("수정된 글은 '수정됨'", async () => {
    renderList([entry(1, { updatedAt: "2026-10-07T00:00:00Z" })]);
    expect(await screen.findByText("(수정됨)")).toBeInTheDocument();
  });
});

describe("방명록 신고·숨김(005 T047)", () => {
  it("공개 방명록에서 로그인 회원에게 남의 글 신고(앵커 #guestbook-{id}), 내 글·비로그인·관리 화면에는 없다", async () => {
    renderList(
      [
        entry(1),
        entry(2, { author: { ...guestAuthor } }),
        entry(3, { author: { userId: 7, nickname: "나", profileImageUrl: null } }),
      ],
      {
        viewerId: 7,
        reportable: true,
      },
    );

    const forms = await screen.findAllByRole("form", { name: "방명록 글 신고" });
    expect(forms.map((form) => form.closest("li")?.id)).toEqual(["guestbook-1", "guestbook-2"]);
    expect(
      within(forms[0].closest("details")!).getByRole("link", {
        name: "회원이 아니신가요? 권리 침해 신고",
      }),
    ).toHaveAttribute("href", "/rights-request?url=%2Fgb%23guestbook-1");
  });

  it("reportable이 아니면(블로그 관리) 신고 버튼이 없다", async () => {
    renderList([entry(1)], { viewerId: 7 });
    expect(await screen.findByText("방명록 1")).toBeInTheDocument();
    expect(screen.queryByText("신고", { selector: "summary" })).toBeNull();
  });

  it("숨긴 내 글은 내용과 안내(고치기·지우기·답글 없음), 남의 숨긴 글은 답글이 있을 때 자리만", async () => {
    renderList(
      [
        entry(1, { hidden: true, author: { userId: 7, nickname: "나", profileImageUrl: null } }),
        entry(2, { hidden: true, content: null, author: null, replies: [entry(3)] }),
      ],
      { viewerId: 7, isOwner: true, reportable: true },
    );

    const mine = await screen.findByText("방명록 1", { selector: "p" });
    const item = mine.closest("li")!;
    expect(item).toHaveTextContent("관리자가 숨긴 글입니다. 나에게만 보입니다.");
    expect(within(item).queryByText("수정")).toBeNull();
    expect(within(item).queryByRole("button", { name: "삭제" })).toBeNull();
    expect(within(item).queryByText("답글 달기")).toBeNull();
    expect(within(item).queryByText("신고", { selector: "summary" })).toBeNull();
    expect(document.getElementById("guestbook-2")).toHaveTextContent(
      "운영 정책에 따라 숨겨진 글입니다.",
    );
  });
});
