// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import {
  PublishSettingsDialog,
  type PublishSettingsDialogProps,
} from "~/components/post/PublishSettingsDialog";
import Write from "~/routes/write";

import { mockBackend, ok } from "../support/backend";
import { postDetail } from "../support/fixtures";
import { renderRoutes, testI18n } from "../support/render";

/** 발행 설정의 대표 이미지(T209, FR-107): 본문 이미지 중에서 고르고, 기본은 첫 이미지 */
vi.mock("~/components/Editor/Editor", () => ({
  Editor: ({ value, onChange }: { value: string; onChange: (markdown: string) => void }) => (
    <textarea aria-label="본문" defaultValue={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const A = "AAAAAAAAAAAAAAAAAAAAAA";
const B = "BBBBBBBBBBBBBBBBBBBBBB";
const C = "CCCCCCCCCCCCCCCCCCCCCC";

function renderDialog(props: Partial<PublishSettingsDialogProps> = {}) {
  const onPublish = vi.fn();
  render(
    <I18nextProvider i18n={testI18n("ko")}>
      <PublishSettingsDialog
        published={false}
        initial={{ visibility: "PUBLIC", commentEnabled: true, categoryId: null, tags: [] }}
        onClose={() => undefined}
        onPublish={onPublish}
        {...props}
      />
    </I18nextProvider>,
  );
  return { onPublish };
}

const publishButton = () => screen.getByRole("button", { name: "공개 발행" });
const thumbnails = () => within(screen.getByRole("group", { name: "대표 이미지" }));

describe("PublishSettingsDialog 대표 이미지", () => {
  it("본문 이미지를 후보로 보이고(100x100 썸네일, 2배 srcset) 기본은 첫 이미지", () => {
    const { onPublish } = renderDialog({ images: [A, B] });

    const first = thumbnails().getByRole("radio", { name: "본문 1번째 이미지" });
    expect(first).toBeChecked();
    expect(thumbnails().getByRole("radio", { name: "본문 2번째 이미지" })).not.toBeChecked();
    const image = thumbnails().getByRole("img", { name: "본문 1번째 이미지" });
    expect(image).toHaveAttribute("src", `/media/${A}/100x100`);
    expect(image).toHaveAttribute("srcset", `/media/${A}/100x100 1x, /media/${A}/200x200 2x`);

    fireEvent.click(publishButton());
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ thumbnailMediaKey: A }));
  });

  it("다른 이미지를 고르면 그 키로 발행한다", () => {
    const { onPublish } = renderDialog({ images: [A, B, C] });

    fireEvent.click(thumbnails().getByRole("radio", { name: "본문 3번째 이미지" }));
    fireEvent.click(publishButton());

    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ thumbnailMediaKey: C }));
  });

  it("저장된 대표 이미지가 아직 본문에 있으면 그것을, 빠졌으면 첫 이미지를 고른다", () => {
    const { onPublish } = renderDialog({
      images: [A, B],
      initial: {
        visibility: "PUBLIC",
        commentEnabled: true,
        categoryId: null,
        tags: [],
        thumbnailMediaKey: B,
      },
    });
    expect(thumbnails().getByRole("radio", { name: "본문 2번째 이미지" })).toBeChecked();
    fireEvent.click(publishButton());
    expect(onPublish).toHaveBeenLastCalledWith(expect.objectContaining({ thumbnailMediaKey: B }));
  });

  it("저장된 대표 이미지가 본문에서 빠졌으면 첫 이미지", () => {
    const { onPublish } = renderDialog({
      images: [A],
      initial: {
        visibility: "PUBLIC",
        commentEnabled: true,
        categoryId: null,
        tags: [],
        thumbnailMediaKey: C,
      },
    });
    fireEvent.click(publishButton());
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ thumbnailMediaKey: A }));
  });

  it("본문에 이미지가 없으면 안내하고 null로 발행한다", () => {
    const { onPublish } = renderDialog();

    expect(
      screen.getByText("본문에 이미지가 없어 대표 이미지 없이 발행합니다."),
    ).toBeInTheDocument();
    fireEvent.click(publishButton());
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ thumbnailMediaKey: null }));
  });
});

describe("글 작성 화면 → 발행 요청의 thumbnailMediaKey", () => {
  it("발행 설정을 열 때 본문의 이미지를 후보로 넘기고, 고른 이미지를 발행 요청에 담는다", async () => {
    const backend = mockBackend({
      "POST /api/v1/blogs/marco/posts/drafts": ok(
        { id: 77, savedAt: "2026-10-06T04:24:19Z" },
        { status: 201 },
      ),
      "POST /api/v1/posts/77/publish": ok({ ...postDetail, id: 77 }),
    });
    renderRoutes(
      [
        {
          path: ":handle/write/:postId?",
          loader: () => ({
            handle: "marco",
            post: null,
            draft: null,
            latestDraft: null,
            categories: [],
          }),
          Component: Write,
        },
        { path: ":handle/:postId", Component: () => <p>post page</p> },
      ],
      { initialEntries: ["/marco/write"] },
    );

    fireEvent.change(await screen.findByLabelText("제목"), { target: { value: "그림 글" } });
    fireEvent.change(screen.getByLabelText("본문"), {
      target: { value: `![a](/media/${A})\n\n글\n\n![b](/media/${B})\n\n![a again](/media/${A})` },
    });
    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    const group = within(screen.getByRole("group", { name: "대표 이미지" }));
    expect(group.getAllByRole("radio")).toHaveLength(2);
    fireEvent.click(group.getByRole("radio", { name: "본문 2번째 이미지" }));
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));

    expect(await screen.findByText("post page")).toBeInTheDocument();
    expect(backend.callsTo("POST /api/v1/posts/77/publish")[0].body).toMatchObject({
      thumbnailMediaKey: B,
    });
  });

  it("발행된 글을 고칠 때는 저장된 대표 이미지로 연다", async () => {
    mockBackend();
    renderRoutes(
      [
        {
          path: ":handle/write/:postId?",
          loader: () => ({
            handle: "marco",
            post: {
              id: 123,
              status: "PUBLISHED",
              visibility: "PUBLIC",
              commentEnabled: true,
              thumbnailUrl: `/media/${B}`,
            },
            draft: {
              title: "제목",
              contentMarkdown: `![a](/media/${A}) ![b](/media/${B})`,
              categoryId: null,
              tags: [],
              savedAt: "2026-10-06T04:24:19Z",
            },
            latestDraft: null,
            categories: [],
          }),
          Component: Write,
        },
      ],
      { initialEntries: ["/marco/write/123"] },
    );

    fireEvent.click(await screen.findByRole("button", { name: "완료" }));

    expect(
      within(screen.getByRole("group", { name: "대표 이미지" })).getByRole("radio", {
        name: "본문 2번째 이미지",
      }),
    ).toBeChecked();
  });
});
