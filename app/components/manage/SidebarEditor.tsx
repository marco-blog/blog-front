import { useTranslation } from "react-i18next";
import { Form, useNavigation } from "react-router";

import type { SidebarConfig } from "~/api/models";

export interface SidebarEditorProps {
  items: SidebarConfig["items"];
}

/**
 * 사이드바 항목 켜기·끄기·순서(004 FR-060). JS 없이 폼으로 동작한다: 체크한 항목이 켜지고, 숨은 값 `order`가 지금 순서다.
 * "위로"·"아래로"는 그 항목을 한 칸 옮겨 곧바로 저장하고, "저장"은 체크 상태를 저장한다(`intent=saveSidebar`).
 */
export function SidebarEditor({ items }: SidebarEditorProps) {
  const { t } = useTranslation();
  const submitting = useNavigation().state === "submitting";
  return (
    <Form method="post" className="sidebar-editor" aria-label={t("manage:design.sidebar")}>
      <input type="hidden" name="intent" value="saveSidebar" />
      <ol>
        {items.map((item, index) => (
          <li key={item.type}>
            <input type="hidden" name="order" value={item.type} />
            <label>
              <input
                type="checkbox"
                name="enabled"
                value={item.type}
                defaultChecked={item.enabled}
              />{" "}
              {t(`blog:sidebar.${item.type}`)}
            </label>{" "}
            <button
              type="submit"
              name="move"
              value={`up:${item.type}`}
              disabled={submitting || index === 0}
              aria-label={t("manage:design.moveUp", { item: t(`blog:sidebar.${item.type}`) })}
            >
              {t("manage:design.up")}
            </button>{" "}
            <button
              type="submit"
              name="move"
              value={`down:${item.type}`}
              disabled={submitting || index === items.length - 1}
              aria-label={t("manage:design.moveDown", { item: t(`blog:sidebar.${item.type}`) })}
            >
              {t("manage:design.down")}
            </button>
          </li>
        ))}
      </ol>
      <button type="submit" disabled={submitting}>
        {t("manage:design.save")}
      </button>
    </Form>
  );
}
