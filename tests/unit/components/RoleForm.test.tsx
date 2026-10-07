// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ROLE_CHOICES, RoleForm } from "~/components/admin/RoleForm";

import { renderRoutes } from "../support/render";

/** 권한 바꾸기 폼(006 T048) */
describe("RoleForm", () => {
  it("정해진 회원: 숨은 번호, 지금 권한 선택, 확인 체크, 버튼", async () => {
    const { container } = renderRoutes([
      {
        index: true,
        Component: () => (
          <RoleForm
            member={{ userId: 7, nickname: "마르코", role: "SUPER_ADMIN" }}
            legend="마르코 권한"
          />
        ),
      },
    ]);
    const group = await screen.findByRole("group", { name: "마르코 권한" });
    expect(container.querySelector('input[name="userId"]')).toHaveValue("7");
    expect(container.querySelector('input[name="intent"]')).toHaveValue("role");
    expect(within(group).getByRole("combobox", { name: "새 권한" })).toHaveValue("SUPER_ADMIN");
    expect(within(group).getByRole("button", { name: "바꾸기" })).toBeInTheDocument();
    expect(within(group).queryByRole("textbox")).toBeNull();
    expect(ROLE_CHOICES).toEqual(["USER", "ADMIN", "SUPER_ADMIN"]);
  });

  it("회원 번호 입력: 기본 권한 ADMIN, 버튼 문구 바꾸기", async () => {
    renderRoutes([
      { index: true, Component: () => <RoleForm legend="지정" submitLabel="지정하기" /> },
    ]);
    const group = await screen.findByRole("group", { name: "지정" });
    expect(within(group).getByRole("textbox", { name: "회원 번호" })).toBeRequired();
    expect(within(group).getByRole("combobox")).toHaveValue("ADMIN");
    expect(within(group).getByRole("button", { name: "지정하기" })).toBeInTheDocument();
  });
});
