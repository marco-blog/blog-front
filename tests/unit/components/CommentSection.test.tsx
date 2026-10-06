// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { useActionData } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Comment } from "~/api/models";
import type { CommentActionData } from "~/components/comment/actions";
import { CommentSection, type CommentSectionProps } from "~/components/comment/CommentSection";

import { renderRoutes } from "../support/render";

const OWNER = { userId: 1, nickname: "주인", role: "USER" };
const WRITER = { userId: 2, nickname: "작성자", role: "USER" };
const STRANGER = { userId: 3, nickname: "손님", role: "USER" };
const VISITOR = { userId: 4, nickname: "방문객", role: "USER" };

function comment(id: number, overrides: Partial<Comment> = {}): Comment {
  return {
    id,
    content: `댓글 ${id}`,
    author: { userId: WRITER.userId, nickname: WRITER.nickname, profileImageUrl: null },
    deleted: false,
    createdAt: "2026-10-06T04:24:19Z",
    updatedAt: "2026-10-06T04:24:19Z",
    replies: [],
    ...overrides,
  };
}

const thread: Comment[] = [
  comment(1, {
    replies: [
      comment(2, {
        content: "주인 답글",
        author: { userId: OWNER.userId, nickname: OWNER.nickname, profileImageUrl: null },
      }),
    ],
  }),
  comment(3, {
    deleted: true,
    content: null,
    author: null,
    replies: [
      comment(4, {
        content: "남은 답글",
        author: { userId: STRANGER.userId, nickname: STRANGER.nickname, profileImageUrl: null },
      }),
    ],
  }),
];

const defaults: CommentSectionProps = {
  comments: thread,
  commentCount: 3,
  commentEnabled: true,
  isPostOwner: false,
  loginHref: "/login?next=%2Fmarco%2F123",
};

interface RenderOptions {
  user?: typeof OWNER | null;
  action?: (form: FormData) => CommentActionData | Promise<CommentActionData>;
}

function renderSection(props: Partial<CommentSectionProps> = {}, options: RenderOptions = {}) {
  const action = vi.fn(
    async ({ request }: { request: Request }) =>
      (await options.action?.(await request.formData())) ?? {
        intent: "create",
        target: "new",
        ok: true,
      },
  );
  function Page() {
    const result = useActionData<CommentActionData>();
    return <CommentSection {...defaults} {...props} result={result} />;
  }
  renderRoutes([{ path: "marco/123", Component: Page, action }], {
    initialEntries: ["/marco/123"],
    user: options.user ?? null,
  });
  return action;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CommentSection", () => {
  it("작성자·작성 시각과 내용, 댓글 수를 보여준다", async () => {
    renderSection();

    expect(await screen.findByRole("heading", { name: "댓글 3" })).toBeInTheDocument();
    const first = screen.getByRole("article", { name: "작성자" });
    expect(first).toHaveTextContent("댓글 1");
    expect(within(first).getByText("2026. 10. 6. 오후 1:24")).toHaveAttribute(
      "dateTime",
      "2026-10-06T04:24:19Z",
    );
  });

  it("비로그인은 로그인 안내(/login?next=)만, 쓰기·답글·수정·삭제 버튼 없음", async () => {
    renderSection();

    expect(await screen.findByRole("link", { name: "댓글을 쓰려면 로그인하세요" })).toHaveAttribute(
      "href",
      "/login?next=%2Fmarco%2F123",
    );
    expect(screen.queryByRole("form", { name: "댓글 내용" })).toBeNull();
    expect(screen.queryByText("답글 달기")).toBeNull();
    expect(screen.queryByText("수정")).toBeNull();
    expect(screen.queryByRole("button", { name: "삭제" })).toBeNull();
  });

  it("답글은 한 단계 들여쓰고, 답글에는 답글 버튼이 없다", async () => {
    renderSection({}, { user: STRANGER });

    const replies = await screen.findAllByRole("list", { name: "답글" });
    expect(replies).toHaveLength(2);
    expect(replies[0].style.marginLeft).toBe("2rem");
    expect(within(replies[0]).getByRole("article", { name: "주인" })).toHaveTextContent(
      "주인 답글",
    );
    expect(within(replies[0]).queryByText("답글 달기")).toBeNull();
    expect(within(replies[0]).queryByRole("list")).toBeNull();
    const top = screen.getByRole("article", { name: "작성자" });
    expect(within(top).getByText("답글 달기")).toBeInTheDocument();
  });

  it("삭제된 댓글은 자리만 남기고 답글은 그대로 보인다(삭제 자리에는 답글 버튼 없음)", async () => {
    renderSection({}, { user: STRANGER });

    const placeholder = (await screen.findByText("삭제된 댓글입니다.")).closest("li")!;
    expect(placeholder).toHaveTextContent("남은 답글");
    expect(within(placeholder).queryByText("답글 달기")).toBeNull();
  });

  it("작성자는 자기 댓글을 수정·삭제, 남의 댓글은 못 한다", async () => {
    renderSection({}, { user: WRITER });

    const own = await screen.findByRole("article", { name: "작성자" });
    expect(within(own).getByText("수정")).toBeInTheDocument();
    expect(within(own).getByRole("button", { name: "삭제" })).toBeInTheDocument();
    const ownerReply = screen.getByRole("article", { name: "주인" });
    expect(within(ownerReply).queryByText("수정")).toBeNull();
    expect(within(ownerReply).queryByRole("button", { name: "삭제" })).toBeNull();
  });

  it("글 주인은 남의 댓글을 지울 수 있지만 고치지는 못한다", async () => {
    renderSection({ isPostOwner: true }, { user: OWNER });

    const other = await screen.findByRole("article", { name: "작성자" });
    expect(within(other).getByRole("button", { name: "삭제" })).toBeInTheDocument();
    expect(within(other).queryByText("수정")).toBeNull();
    const own = screen.getByRole("article", { name: "주인" });
    expect(within(own).getByText("수정")).toBeInTheDocument();
  });

  it("다른 회원은 수정·삭제 버튼이 없다", async () => {
    renderSection({}, { user: VISITOR });

    await screen.findByRole("heading", { name: "댓글 3" });
    expect(screen.queryByText("수정")).toBeNull();
    expect(screen.queryByRole("button", { name: "삭제" })).toBeNull();
  });

  it("댓글이 막힌 글(COMMENTS_DISABLED)은 안내만 보이고 쓰기·답글 폼이 없다", async () => {
    renderSection({ commentEnabled: false }, { user: WRITER });

    expect(await screen.findByRole("note")).toHaveTextContent("이 글에는 댓글을 쓸 수 없습니다.");
    expect(screen.queryByRole("form", { name: "댓글 내용" })).toBeNull();
    expect(screen.queryByText("답글 달기")).toBeNull();
    // 이미 쓴 댓글의 수정·삭제는 그대로 된다.
    expect(screen.getAllByText("수정").length).toBeGreaterThan(0);
  });

  it("출력은 이스케이프한다(HTML로 해석하지 않음)", async () => {
    renderSection({
      comments: [
        comment(9, { content: '<img src=x onerror="alert(1)"><script>alert(2)</script>' }),
      ],
    });

    const article = await screen.findByRole("article", { name: "작성자" });
    expect(article).toHaveTextContent('<img src=x onerror="alert(1)"><script>alert(2)</script>');
    expect(article.querySelector("img")).toBeNull();
    expect(article.querySelector("script")).toBeNull();
  });

  it("빈 목록 안내", async () => {
    renderSection({ comments: [], commentCount: 0 });
    expect(await screen.findByText("아직 댓글이 없습니다.")).toBeInTheDocument();
  });

  it("댓글을 불러오지 못하면 안내", async () => {
    renderSection({ comments: null });
    expect(await screen.findByText("댓글을 불러오지 못했습니다.")).toBeInTheDocument();
  });

  it("수정된 댓글은 (수정됨), 작성자를 모르면 대신 문구", async () => {
    renderSection({
      comments: [comment(5, { updatedAt: "2026-10-06T05:00:00Z", author: null })],
    });
    const article = await screen.findByRole("article", { name: "알 수 없는 작성자" });
    expect(article).toHaveTextContent("(수정됨)");
  });

  it("새 댓글 쓰기는 action으로 내용을 보낸다", async () => {
    const action = renderSection({}, { user: WRITER });

    const form = await screen.findByRole("form", { name: "댓글 내용" });
    fireEvent.change(within(form).getByLabelText("댓글 내용"), { target: { value: "반가워요" } });
    fireEvent.click(within(form).getByRole("button", { name: "댓글 등록" }));

    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const sent = await action.mock.calls[0][0].request.formData();
    expect(Object.fromEntries(sent)).toEqual({
      intent: "create",
      target: "new",
      content: "반가워요",
    });
  });

  it("답글은 부모 id와 함께, 수정은 댓글 id와 함께 보낸다", async () => {
    const forms: Record<string, string>[] = [];
    renderSection(
      {},
      {
        user: WRITER,
        action: (form) => {
          forms.push(Object.fromEntries(form) as Record<string, string>);
          return { intent: "create", target: String(form.get("target")), ok: true };
        },
      },
    );

    const reply = await screen.findByRole("form", { name: "답글 내용" });
    fireEvent.change(within(reply).getByLabelText("답글 내용"), { target: { value: "답글" } });
    fireEvent.click(within(reply).getByRole("button", { name: "답글 등록" }));
    await vi.waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]).toEqual({
      intent: "create",
      target: "reply-1",
      parentId: "1",
      content: "답글",
    });

    const edits = screen.getAllByRole("form", { name: "고칠 내용" });
    const edit = edits[0];
    expect(within(edit).getByLabelText("고칠 내용")).toHaveValue("댓글 1");
    fireEvent.change(within(edit).getByLabelText("고칠 내용"), { target: { value: "고침" } });
    fireEvent.click(within(edit).getByRole("button", { name: "수정 완료" }));
    await vi.waitFor(() => expect(forms).toHaveLength(2));
    expect(forms[1]).toEqual({ intent: "edit", target: "edit-1", commentId: "1", content: "고침" });
  });

  it("삭제는 한 번 더 묻고, 취소하면 보내지 않는다", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const action = renderSection({}, { user: WRITER });

    const own = await screen.findByRole("article", { name: "작성자" });
    fireEvent.click(within(own).getByRole("button", { name: "삭제" }));
    expect(confirm).toHaveBeenCalledWith("이 댓글을 삭제할까요?");
    expect(action).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(within(own).getByRole("button", { name: "삭제" }));
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const sent = await action.mock.calls[0][0].request.formData();
    expect(Object.fromEntries(sent)).toEqual({
      intent: "delete",
      target: "delete-1",
      commentId: "1",
    });
  });

  it("action 오류는 해당 폼에 화면 언어 문구로(COMMENTS_DISABLED, 필드 오류, 삭제 권한)", async () => {
    renderSection(
      {},
      {
        user: WRITER,
        action: (form) => {
          const target = String(form.get("target"));
          if (target === "new") {
            return {
              intent: "create",
              target,
              ok: false,
              resultCode: "COMMENTS_DISABLED",
              field: null,
              fieldErrors: [],
            };
          }
          if (target.startsWith("delete")) {
            return {
              intent: "delete",
              target,
              ok: false,
              resultCode: "FORBIDDEN",
              field: null,
              fieldErrors: [],
            };
          }
          return {
            intent: "create",
            target,
            ok: false,
            resultCode: "VALIDATION_FAILED",
            field: null,
            fieldErrors: [{ field: "content", code: "TOO_LONG", params: { max: 1000 } }],
          };
        },
      },
    );

    const form = await screen.findByRole("form", { name: "댓글 내용" });
    fireEvent.change(within(form).getByLabelText("댓글 내용"), { target: { value: "글" } });
    fireEvent.click(within(form).getByRole("button", { name: "댓글 등록" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "이 글에는 댓글을 쓸 수 없습니다.",
    );

    const reply = screen.getByRole("form", { name: "답글 내용" });
    fireEvent.change(within(reply).getByLabelText("답글 내용"), { target: { value: "답" } });
    fireEvent.click(within(reply).getByRole("button", { name: "답글 등록" }));
    expect(await within(reply).findByText("1000자 이하로 입력해 주세요.")).toBeInTheDocument();
    expect(within(form).queryByRole("alert")).toBeNull();

    vi.stubGlobal("confirm", () => true);
    const own = screen.getByRole("article", { name: "작성자" });
    fireEvent.click(within(own).getByRole("button", { name: "삭제" }));
    expect(await within(own).findByText("이 작업을 할 권한이 없습니다.")).toHaveAttribute(
      "role",
      "alert",
    );
  });
});
