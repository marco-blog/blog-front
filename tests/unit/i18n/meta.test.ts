import { describe, expect, it } from "vitest";

import { metaT } from "~/i18n/meta";
import { resourcesFor } from "~/i18n/resources.server";

describe("metaT", () => {
  it("root loader 데이터의 언어로 번역한다", () => {
    const t = metaT([
      { id: "root", loaderData: { language: "ja", resources: resourcesFor("ja") } },
      undefined,
    ]);
    expect(t("appName")).toBe("ブログ");
  });

  it("root 데이터가 없으면 영어 인스턴스(리소스 없음)", () => {
    const t = metaT([{ id: "routes/home", loaderData: {} }]);
    expect(t("appName")).toBe("appName");
    expect(metaT([{ id: "root", loaderData: { language: "xx", resources: {} } }])("appName")).toBe(
      "appName",
    );
  });
});
