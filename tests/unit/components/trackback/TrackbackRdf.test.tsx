// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TrackbackRdf, rdfEscape, trackbackRdf } from "~/components/trackback/TrackbackRdf";

const props = {
  postUrl: "https://blog.java21.net/marco/123",
  title: "제목",
  trackbackUrl: "https://blog.java21.net/marco/123/trackback",
};

/** HTML 주석 안의 RDF를 꺼내 XML로 읽는다(다른 블로그 도구가 하듯) */
function parseRdf(html: string): Document {
  const match = /<!--([\s\S]*?)-->/.exec(html);
  expect(match).not.toBeNull();
  return new DOMParser().parseFromString(match![1], "application/xml");
}

describe("TrackbackRdf(005 T093)", () => {
  it("HTML 주석 안에 dc:identifier·dc:title·trackback:ping", () => {
    const html = renderToString(<TrackbackRdf {...props} />);
    expect(html).toContain("<!--");
    expect(html).toContain("hidden");

    const description = parseRdf(html).getElementsByTagName("rdf:Description")[0];
    expect(description.getAttribute("rdf:about")).toBe(props.postUrl);
    expect(description.getAttribute("dc:identifier")).toBe(props.postUrl);
    expect(description.getAttribute("dc:title")).toBe("제목");
    expect(description.getAttribute("trackback:ping")).toBe(props.trackbackUrl);
  });

  it("제목은 XML 이스케이프, `--`·`-->`가 주석을 깨지 않는다", () => {
    const title = `<script>"a" & 'b' -- end --> <!-- x`;
    const rdf = trackbackRdf({ ...props, title });

    // 주석은 처음과 끝 하나뿐
    expect(rdf.match(/<!--/g)).toHaveLength(1);
    expect(rdf.match(/-->/g)).toHaveLength(1);
    expect(rdf.slice(4, -3)).not.toContain("--");
    expect(rdf).not.toContain("<script>");

    const description = parseRdf(rdf).getElementsByTagName("rdf:Description")[0];
    expect(description.getAttribute("dc:title")).toBe(title);
  });

  it("rdfEscape", () => {
    expect(rdfEscape(`a&b<c>"d'-`)).toBe("a&amp;b&lt;c&gt;&quot;d&apos;&#45;");
  });
});
