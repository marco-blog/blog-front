// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Write from "~/routes/write";

import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes } from "../support/render";

/**
 * 글 작성 화면의 이미지 업로드(T208, FR-038·039). 에디터(Milkdown Crepe)는 붙여넣기·끌어놓기·이미지 블록의
 * 업로드 버튼 모두 image-block의 `onUpload`로 파일을 넘기고, 돌려받은 주소로 이미지를 본문에 넣는다.
 * 여기서는 Crepe를 가짜로 바꿔 그 동작(업로드 → 본문 삽입)을 흉내 낸다.
 */
const crepe = vi.hoisted(() => ({ instances: [] as FakeCrepe[] }));

interface FakeCrepe {
  config: { featureConfigs: Record<string, Record<string, unknown>>; defaultValue: string };
  markdown: string;
  emit: (markdown: string) => void;
}

vi.mock("@milkdown/crepe", () => ({
  Crepe: class {
    instance: FakeCrepe;
    listener: ((ctx: unknown, markdown: string, prev: string) => void) | null = null;
    constructor(config: FakeCrepe["config"]) {
      this.instance = {
        config,
        markdown: config.defaultValue,
        emit: (markdown) => this.listener?.(null, markdown, ""),
      };
      crepe.instances.push(this.instance);
    }
    on(
      fn: (api: {
        markdownUpdated: (cb: (ctx: unknown, markdown: string, prev: string) => void) => void;
      }) => void,
    ) {
      fn({ markdownUpdated: (cb) => (this.listener = cb) });
      return this;
    }
    async create() {
      return {};
    }
    getMarkdown() {
      return this.instance.markdown;
    }
    async destroy() {
      return {};
    }
  },
}));
vi.mock("~/components/Editor/styles", () => ({}));

const KEY = "k3Jd9fQ2xLmA7pZ0bR5tYw";
const UPLOAD = "POST /api/v1/media";
const CREATE_DRAFT = "POST /api/v1/blogs/marco/posts/drafts";

const uploaded = (key = KEY) =>
  ok(
    { key, url: `/media/${key}`, mime: "image/png", size: 68, width: 1, height: 1 },
    { status: 201 },
  );

beforeEach(() => {
  crepe.instances.length = 0;
});

function renderWrite() {
  return renderRoutes(
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
    ],
    { initialEntries: ["/marco/write"] },
  );
}

async function editor(): Promise<FakeCrepe> {
  await vi.waitFor(() => expect(crepe.instances).toHaveLength(1));
  await vi.waitFor(() => expect(screen.queryByText("에디터를 불러오는 중입니다.")).toBeNull());
  return crepe.instances[0];
}

/** Crepe가 붙여넣기·끌어놓기 때 하는 일: onUpload로 올리고, 돌려받은 주소의 이미지를 본문에 넣는다. */
async function paste(instance: FakeCrepe, file: File): Promise<string> {
  const onUpload = instance.config.featureConfigs["image-block"].onUpload as (
    file: File,
  ) => Promise<string>;
  let url = "";
  await act(async () => {
    url = await onUpload(file);
  });
  instance.markdown = `${instance.markdown}\n\n![](${url})`;
  act(() => instance.emit(instance.markdown));
  return url;
}

const png = (name = "a.png", size = 68) =>
  new File([new Uint8Array(size)], name, { type: "image/png" });

describe("에디터 이미지 업로드(T208)", () => {
  it("이미지 블록을 켜고, 업로드 버튼·안내 문구는 화면 언어로", async () => {
    mockBackend();
    renderWrite();
    const { config } = await editor();

    expect(config.featureConfigs["image-block"]).toMatchObject({
      blockUploadButton: "이미지 올리기",
      blockUploadPlaceholderText: "또는 이미지 주소를 붙여 넣으세요",
      inlineUploadButton: "이미지 올리기",
    });
  });

  it("붙여넣은 이미지를 POST /api/v1/media(multipart file, purpose=POST)로 올리고 /media/{key}를 본문에 넣는다", async () => {
    const backend = mockBackend({
      [UPLOAD]: uploaded(),
      [CREATE_DRAFT]: ok({ id: 77, savedAt: "2026-10-06T04:24:19Z" }, { status: 201 }),
    });
    renderWrite();
    const instance = await editor();

    const url = await paste(instance, png("붙여넣은.png"));

    expect(url).toBe(`/media/${KEY}`);
    const [upload] = backend.callsTo(UPLOAD);
    expect(upload.url.pathname).toBe("/api/v1/media");
    const body = upload.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get("file") as File).name).toBe("붙여넣은.png");
    expect(body.get("purpose")).toBe("POST");

    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "그림 글" } });
    fireEvent.click(screen.getByRole("button", { name: "임시저장" }));
    await vi.waitFor(() => expect(backend.callsTo(CREATE_DRAFT)).toHaveLength(1));
    expect(backend.callsTo(CREATE_DRAFT)[0].body).toMatchObject({
      contentMarkdown: `\n\n![](/media/${KEY})`,
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    [413, "MEDIA_TOO_LARGE", "이미지는 10MB 이하만 올릴 수 있습니다."],
    [415, "MEDIA_TYPE_NOT_ALLOWED", "JPEG, PNG, GIF, WebP 이미지만 올릴 수 있습니다."],
    [
      429,
      "MEDIA_TEMP_QUOTA_EXCEEDED",
      "저장하지 않은 이미지가 너무 많습니다. 글을 저장한 뒤 다시 올려 주세요.",
    ],
    // 005 업로드 속도 한도(1분 30개)
    [429, "TOO_MANY_REQUESTS", "이미지를 너무 많이 올렸습니다. 잠시 후 다시 올려 주세요."],
  ])("%i %s: 이유를 알리고 본문에 넣지 않는다", async (status, code, message) => {
    mockBackend({ [UPLOAD]: fail(status, code) });
    renderWrite();
    const instance = await editor();
    const onUpload = instance.config.featureConfigs["image-block"].onUpload as (
      file: File,
    ) => Promise<string>;

    await act(async () => {
      await expect(onUpload(png())).rejects.toMatchObject({ resultCode: code });
    });

    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });

  it("10MB를 넘는 파일은 보내지 않고 바로 알린다", async () => {
    const backend = mockBackend({ [UPLOAD]: uploaded() });
    renderWrite();
    const instance = await editor();
    const onUpload = instance.config.featureConfigs["image-block"].onUpload as (
      file: File,
    ) => Promise<string>;

    await act(async () => {
      await expect(onUpload(png("big.png", 10 * 1024 * 1024 + 1))).rejects.toMatchObject({
        status: 413,
      });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("이미지는 10MB 이하만 올릴 수 있습니다.");
    expect(backend.callsTo(UPLOAD)).toHaveLength(0);
  });

  it("다음 업로드가 성공하면 앞의 오류 문구를 지운다", async () => {
    let attempt = 0;
    mockBackend({
      [UPLOAD]: () => (++attempt === 1 ? fail(415, "MEDIA_TYPE_NOT_ALLOWED") : uploaded()),
    });
    renderWrite();
    const instance = await editor();
    const onUpload = instance.config.featureConfigs["image-block"].onUpload as (
      file: File,
    ) => Promise<string>;

    await act(async () => {
      await onUpload(png()).catch(() => undefined);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await paste(instance, png());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
