// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { TAG_MAX, TagInput, normalizeTag } from "~/components/post/TagInput";
import type { Language } from "~/i18n/config";

import { testI18n } from "../support/render";

function Harness({
  initial = [],
  onChange,
}: {
  initial?: string[];
  onChange?: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState(initial);
  return (
    <TagInput
      value={tags}
      onChange={(next) => {
        setTags(next);
        onChange?.(next);
      }}
    />
  );
}

function renderInput(initial: string[] = [], language: Language = "ko") {
  const onChange = vi.fn();
  render(
    <I18nextProvider i18n={testI18n(language)}>
      <Harness initial={initial} onChange={onChange} />
    </I18nextProvider>,
  );
  return { onChange, input: screen.getByRole("textbox") };
}

const shown = () =>
  within(screen.queryByRole("list", { name: "태그" }) ?? document.createElement("ul"))
    .queryAllByRole("listitem")
    .map((item) => item.querySelector("span")?.textContent);

describe("normalizeTag", () => {
  it("앞뒤 공백을 빼고 소문자로, 단어 사이 공백은 그대로", () => {
    expect(normalizeTag(" Spring Boot ")).toBe("spring boot");
    expect(normalizeTag("JPA")).toBe("jpa");
    expect(normalizeTag("   ")).toBe("");
  });
});

describe("TagInput", () => {
  it("Enter·쉼표·추가 버튼으로 넣고 정규화해 보여준다", () => {
    const { input, onChange } = renderInput();

    fireEvent.change(input, { target: { value: " Spring Boot " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "JPA" } });
    fireEvent.keyDown(input, { key: "," });
    fireEvent.change(input, { target: { value: "Java" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(shown()).toEqual(["#spring boot", "#jpa", "#java"]);
    expect(onChange).toHaveBeenLastCalledWith(["spring boot", "jpa", "java"]);
    expect(input).toHaveValue("");
  });

  it("이미 있는 태그(대소문자만 다른 것 포함)와 빈 값은 넣지 않는다", () => {
    const { input, onChange } = renderInput(["jpa"]);

    fireEvent.change(input, { target: { value: "JPA" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "a" });

    expect(shown()).toEqual(["#jpa"]);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("한글 조합 중 Enter는 무시한다", () => {
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: "스프" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("스프");
  });

  it("11번째는 넣지 않고 안내한다", () => {
    const ten = Array.from({ length: TAG_MAX }, (_, i) => `tag${i}`);
    const { input, onChange } = renderInput(ten);

    fireEvent.change(input, { target: { value: "eleventh" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(shown()).toHaveLength(10);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("태그는 10개까지 넣을 수 있습니다.");
    expect(input).toHaveValue("eleventh");
  });

  it("30자를 넘으면 넣지 않고 안내, 빼기 버튼으로 뺀다", () => {
    const { input, onChange } = renderInput(["spring", "jpa"]);

    fireEvent.change(input, { target: { value: "a".repeat(31) } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("alert")).toHaveTextContent("태그는 30자까지 쓸 수 있습니다.");
    expect(input).toHaveAttribute("aria-invalid", "true");

    fireEvent.click(screen.getByRole("button", { name: "spring 태그 빼기" }));
    expect(shown()).toEqual(["#jpa"]);
    expect(onChange).toHaveBeenLastCalledWith(["jpa"]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("다른 언어 문구", () => {
    renderInput([], "en");
    expect(screen.getByText(/Up to 10 tags/)).toBeInTheDocument();
  });
});
