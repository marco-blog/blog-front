// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Editor, type EditorHandle } from "~/components/Editor/Editor";

import { testI18n } from "../support/render";

/**
 * 에디터 래퍼(R7): Milkdown Crepe를 브라우저에서만 불러오고, 상단 툴바·AI는 끄며,
 * 문구는 화면 언어(editor 네임스페이스)로 넣는다. Crepe는 가짜로 바꿔 설정과 수명만 본다.
 */
const crepe = vi.hoisted(() => ({
  instances: [] as FakeCrepe[],
  failCreate: false,
}));

interface FakeCrepe {
  config: Record<string, unknown> & {
    features: Record<string, boolean>;
    featureConfigs: Record<string, Record<string, unknown>>;
    defaultValue: string;
    root: HTMLElement;
  };
  emit: (markdown: string) => void;
  /** 에디터 안의 지금 내용(입력 알림 markdownUpdated는 늦게 올 수 있다) */
  markdown: string;
  destroyed: boolean;
}

vi.mock("@milkdown/crepe", () => ({
  Crepe: class {
    instance: FakeCrepe;
    listener: ((ctx: unknown, markdown: string, prev: string) => void) | null = null;
    constructor(config: FakeCrepe["config"]) {
      this.instance = {
        config,
        emit: (markdown) => this.listener?.(null, markdown, ""),
        markdown: config.defaultValue,
        destroyed: false,
      };
      crepe.instances.push(this.instance);
    }
    on(fn: (api: { markdownUpdated: (cb: FakeCrepeListener) => void }) => void) {
      fn({ markdownUpdated: (cb) => (this.listener = cb) });
      return this;
    }
    async create() {
      if (crepe.failCreate) throw new Error("load failed");
      return {};
    }
    getMarkdown() {
      return this.instance.markdown;
    }
    async destroy() {
      this.instance.destroyed = true;
      return {};
    }
  },
}));
vi.mock("~/components/Editor/styles", () => ({}));

type FakeCrepeListener = (ctx: unknown, markdown: string, prev: string) => void;

beforeEach(() => {
  crepe.instances.length = 0;
  crepe.failCreate = false;
});

function renderEditor(props: Partial<Parameters<typeof Editor>[0]> = {}, language = "ko" as const) {
  const onChange = vi.fn();
  const utils = render(
    <I18nextProvider i18n={testI18n(language)}>
      <Editor value="# 처음" onChange={onChange} {...props} />
    </I18nextProvider>,
  );
  return { ...utils, onChange };
}

describe("Editor", () => {
  it("불러오는 동안 안내를 보이고, 브라우저에서 Crepe를 만든다", async () => {
    renderEditor();

    expect(screen.getByText("에디터를 불러오는 중입니다.")).toBeInTheDocument();
    await vi.waitFor(() => expect(crepe.instances).toHaveLength(1));
    await vi.waitFor(() => expect(screen.queryByText("에디터를 불러오는 중입니다.")).toBeNull());

    const { config } = crepe.instances[0];
    expect(config.defaultValue).toBe("# 처음");
    expect(config.root).toHaveClass("editor-root");
  });

  it("상단 툴바·AI·수식은 끄고, 업로드 함수가 없으면 이미지 블록도 끈다", async () => {
    renderEditor();
    await vi.waitFor(() => expect(crepe.instances).toHaveLength(1));

    expect(crepe.instances[0].config.features).toEqual({
      "top-bar": false,
      ai: false,
      latex: false,
      "image-block": false,
    });
  });

  it("문구는 화면 언어로 넣는다(플레이스홀더, / 메뉴, 선택 메뉴)", async () => {
    renderEditor({}, "en" as never);
    await vi.waitFor(() => expect(crepe.instances).toHaveLength(1));

    const { featureConfigs } = crepe.instances[0].config;
    expect(featureConfigs.placeholder).toEqual({
      text: "Start writing. Type / to open the formatting menu.",
      mode: "doc",
    });
    expect(featureConfigs["block-edit"]).toMatchObject({
      textGroup: { label: "Text", h1: { label: "Heading 1" }, h4: null },
      advancedGroup: { image: null, codeBlock: { label: "Code block" }, math: null },
    });
    expect(featureConfigs.toolbar).toMatchObject({ boldLabel: "Bold", linkLabel: "Link" });
  });

  it("입력하면 Markdown을 onChange로 넘긴다", async () => {
    const { onChange } = renderEditor();
    await vi.waitFor(() => expect(crepe.instances).toHaveLength(1));

    act(() => crepe.instances[0].emit("# 바뀐 글"));

    expect(onChange).toHaveBeenCalledWith("# 바뀐 글");
  });

  it("ref.getMarkdown()은 입력 알림을 기다리지 않고 에디터의 지금 내용을 준다(불러오기 전에는 null)", async () => {
    const ref = createRef<EditorHandle>();
    renderEditor({ ref });

    expect(ref.current?.getMarkdown()).toBeNull();
    await vi.waitFor(() => expect(screen.queryByText("에디터를 불러오는 중입니다.")).toBeNull());

    crepe.instances[0].markdown = "# 방금 친 글";
    expect(ref.current?.getMarkdown()).toBe("# 방금 친 글");
  });

  it("업로드 함수를 주면 이미지 블록을 켜고 그 함수로 올린다", async () => {
    const onUploadImage = vi.fn(async () => "/media/k3Jd9fQ2xLmA7pZ0bR5tYw");
    renderEditor({ onUploadImage });
    await vi.waitFor(() => expect(crepe.instances).toHaveLength(1));

    const { config } = crepe.instances[0];
    expect(config.features["image-block"]).toBe(true);
    const upload = config.featureConfigs["image-block"].onUpload as (file: File) => Promise<string>;
    await expect(upload(new File(["x"], "a.png"))).resolves.toBe("/media/k3Jd9fQ2xLmA7pZ0bR5tYw");
    expect(onUploadImage).toHaveBeenCalled();
  });

  it("화면을 떠나면 에디터를 정리한다", async () => {
    const { unmount } = renderEditor();
    await vi.waitFor(() => expect(crepe.instances).toHaveLength(1));

    unmount();

    expect(crepe.instances[0].destroyed).toBe(true);
  });

  it("불러오지 못하면 기본 입력란으로 계속 쓸 수 있다", async () => {
    crepe.failCreate = true;
    const { onChange } = renderEditor();

    const textarea = await screen.findByRole("textbox", { name: "본문" });
    expect(screen.getByRole("status")).toHaveTextContent("에디터를 불러오지 못해");
    expect(textarea).toHaveValue("# 처음");
    fireEvent.change(textarea, { target: { value: "직접 입력" } });
    expect(onChange).toHaveBeenCalledWith("직접 입력");
  });

  it("기본 입력란은 onChange가 바로 오므로 getMarkdown()은 null", async () => {
    crepe.failCreate = true;
    const ref = createRef<EditorHandle>();
    renderEditor({ ref });

    await screen.findByRole("textbox", { name: "본문" });
    expect(ref.current?.getMarkdown()).toBeNull();
  });
});
