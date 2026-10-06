import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * 글 에디터 래퍼(research.md R7, FR-014). 화면은 이 인터페이스만 쓰고 에디터 라이브러리를 직접 부르지 않는다.
 * 에디터를 바꿔도 `value`·`onChange`·`onUploadImage`는 그대로 둔다.
 */
export interface EditorProps {
  /** 처음 보여줄 Markdown. 바뀐 값을 다시 넣으려면 `key`를 바꿔 새로 만든다(에디터는 비제어 컴포넌트). */
  value: string;
  /** 입력할 때마다 Markdown 전체 */
  onChange: (markdown: string) => void;
  /** 이미지 업로드(US4). 없으면 이미지 블록을 끈다. 올린 이미지의 주소(`/media/{key}`)를 돌려준다. */
  onUploadImage?: (file: File) => Promise<string>;
  /** 스크린 리더용 이름 */
  label?: string;
}

type Status = "loading" | "ready" | "failed";

interface CrepeLike {
  create: () => Promise<unknown>;
  destroy: () => Promise<unknown>;
  on: (fn: (api: MarkdownListener) => void) => unknown;
}

interface MarkdownListener {
  markdownUpdated: (fn: (ctx: unknown, markdown: string, prevMarkdown: string) => void) => unknown;
}

/** Milkdown Crepe 설정: 상단 툴바·AI·수식 없이, `/` 메뉴와 선택 시 작은 메뉴만(FR-014, R7). 문구는 editor 네임스페이스. */
export function crepeConfig(
  t: TFunction,
  root: HTMLElement,
  defaultValue: string,
  onUploadImage?: (file: File) => Promise<string>,
) {
  return {
    root,
    defaultValue,
    features: {
      "top-bar": false,
      ai: false,
      latex: false,
      "image-block": Boolean(onUploadImage),
    },
    featureConfigs: {
      placeholder: { text: t("editor:placeholder"), mode: "doc" as const },
      "block-edit": {
        textGroup: {
          label: t("editor:menu.text"),
          text: { label: t("editor:menu.paragraph") },
          h1: { label: t("editor:menu.h1") },
          h2: { label: t("editor:menu.h2") },
          h3: { label: t("editor:menu.h3") },
          h4: null,
          h5: null,
          h6: null,
          quote: { label: t("editor:menu.quote") },
          divider: { label: t("editor:menu.divider") },
        },
        listGroup: {
          label: t("editor:menu.list"),
          bulletList: { label: t("editor:menu.bulletList") },
          orderedList: { label: t("editor:menu.orderedList") },
          taskList: { label: t("editor:menu.taskList") },
        },
        advancedGroup: {
          label: t("editor:menu.advanced"),
          image: onUploadImage ? { label: t("editor:menu.image") } : null,
          codeBlock: { label: t("editor:menu.codeBlock") },
          table: { label: t("editor:menu.table") },
          math: null,
        },
      },
      toolbar: {
        boldLabel: t("editor:toolbar.bold"),
        italicLabel: t("editor:toolbar.italic"),
        strikethroughLabel: t("editor:toolbar.strikethrough"),
        codeLabel: t("editor:toolbar.code"),
        linkLabel: t("editor:toolbar.link"),
      },
      "code-mirror": {
        searchPlaceholder: t("editor:code.search"),
        noResultText: t("editor:code.noResult"),
        copyText: t("editor:code.copy"),
      },
      "link-tooltip": { inputPlaceholder: t("editor:link.placeholder") },
      ...(onUploadImage ? { "image-block": { onUpload: onUploadImage } } : {}),
    },
  };
}

/**
 * Milkdown Crepe를 브라우저에서만 지연 로딩한다(SSR 제외). 서버 렌더링과 로딩 중에는 안내만 보이고,
 * 불러오지 못하면 기본 입력란(textarea)으로 계속 쓸 수 있게 한다.
 */
export function Editor({ value, onChange, onUploadImage, label }: EditorProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  // 에디터는 한 번만 만들고, 최신 콜백은 ref로 읽는다.
  const latest = useRef({ value, onChange, onUploadImage, t });
  useEffect(() => {
    latest.current = { value, onChange, onUploadImage, t };
  });

  useEffect(() => {
    let cancelled = false;
    let editor: CrepeLike | null = null;

    void (async () => {
      try {
        const [{ Crepe }] = await Promise.all([import("@milkdown/crepe"), import("./styles")]);
        const root = rootRef.current;
        if (cancelled || !root) {
          return;
        }
        const initial = latest.current;
        const upload = initial.onUploadImage
          ? (file: File) => latest.current.onUploadImage!(file)
          : undefined;
        const crepe = new Crepe(
          crepeConfig(initial.t, root, initial.value, upload) as ConstructorParameters<
            typeof Crepe
          >[0],
        ) as unknown as CrepeLike;
        editor = crepe;
        crepe.on((listener) => {
          listener.markdownUpdated((_ctx, markdown) => latest.current.onChange(markdown));
        });
        await crepe.create();
        if (!cancelled) {
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setStatus("failed");
        }
      }
    })();

    return () => {
      cancelled = true;
      void editor?.destroy().catch(() => undefined);
    };
  }, []);

  return (
    <div className="editor">
      {status === "loading" && <p className="editor-loading">{t("editor:loading")}</p>}
      {status === "failed" ? (
        <>
          <p role="status">{t("editor:loadFailed")}</p>
          <textarea
            aria-label={label ?? t("editor:bodyLabel")}
            defaultValue={value}
            onChange={(event) => onChange(event.target.value)}
            rows={20}
          />
        </>
      ) : (
        <div ref={rootRef} className="editor-root" aria-label={label ?? t("editor:bodyLabel")} />
      )}
    </div>
  );
}
