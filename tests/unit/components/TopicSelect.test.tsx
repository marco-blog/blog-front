// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { TopicNode } from "~/api/models";
import { TopicSelect } from "~/components/post/TopicSelect";
import type { Language } from "~/i18n/config";

import { topicNode } from "../support/fixtures";
import { testI18n } from "../support/render";

const topics: TopicNode[] = [
  topicNode(1, "dev", {}, [
    topicNode(11, "java", { parentId: 1 }),
    topicNode(12, "web", { parentId: 1 }),
  ]),
  topicNode(2, "life", {}, [topicNode(21, "travel", { parentId: 2 })]),
  topicNode(3, "empty"),
];

function Harness({
  initial,
  onChange,
}: {
  initial: number | null;
  onChange: (id: number | null) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <TopicSelect
      topics={topics}
      value={value}
      name="topicId"
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

function renderSelect(initial: number | null = null, language: Language = "ko") {
  const onChange = vi.fn();
  render(
    <I18nextProvider i18n={testI18n(language)}>
      <Harness initial={initial} onChange={onChange} />
    </I18nextProvider>,
  );
  return { onChange, select: screen.getByRole("combobox", { name: /주제|Topic/ }) };
}

/** 주제 고르기(003 T073, FR-076) */
describe("TopicSelect", () => {
  it("첫 항목은 선택 안 함, 대분류별로 묶은 소분류만 고를 수 있다(소분류 없는 대분류는 그리지 않음)", () => {
    const { select } = renderSelect();

    expect(select).toHaveValue("");
    expect(select).toHaveAttribute("name", "topicId");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["선택 안 함", "java 한", "web 한", "travel 한"]);
    expect(
      within(select)
        .getAllByRole("group")
        .map((g) => g.getAttribute("label")),
    ).toEqual(["dev 한", "life 한"]);
    expect(screen.getByText(/포털 주제 페이지/)).toBeInTheDocument();
  });

  it("고르면 번호를, 선택 안 함은 null을 알린다", () => {
    const { select, onChange } = renderSelect();

    fireEvent.change(select, { target: { value: "21" } });
    expect(onChange).toHaveBeenLastCalledWith(21);
    expect(select).toHaveValue("21");
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("화면 언어 이름으로 보여준다", () => {
    const { select } = renderSelect(null, "en");

    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["None", "java en", "web en", "travel en"]);
  });

  it.each([
    ["트리에 없는(숨긴) 주제", 99],
    ["대분류", 1],
  ])("지금 값이 %s면 '현재 주제(숨김)'으로 남겨 다시 발행해도 바뀌지 않는다", (_name, value) => {
    const { select } = renderSelect(value);

    expect(select).toHaveValue(String(value));
    expect(within(select).getAllByRole("option")[1]).toHaveTextContent("현재 주제(숨김)");
  });

  it("label을 바꾸고 막을 수 있다", () => {
    render(
      <I18nextProvider i18n={testI18n("ko")}>
        <TopicSelect topics={topics} value={null} onChange={() => {}} label="기본 주제" disabled />
      </I18nextProvider>,
    );

    expect(screen.getByRole("combobox", { name: "기본 주제" })).toBeDisabled();
  });
});
