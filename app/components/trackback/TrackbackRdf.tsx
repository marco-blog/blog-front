/** XML 속성 값 이스케이프. `-`도 문자 참조로 바꿔 HTML 주석 안에서 `--`가 생기지 않게 한다. */
export function rdfEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/-/g, "&#45;");
}

/** HTML 주석으로 감싼 TrackBack RDF 문자열(자동 발견). 값은 모두 이스케이프한다. */
export function trackbackRdf({
  postUrl,
  title,
  trackbackUrl,
}: {
  postUrl: string;
  title: string;
  trackbackUrl: string;
}): string {
  const about = rdfEscape(postUrl);
  return [
    "<!--",
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"',
    '         xmlns:dc="http://purl.org/dc/elements/1.1/"',
    '         xmlns:trackback="http://madskills.com/public/xml/rss/module/trackback/">',
    `<rdf:Description rdf:about="${about}" dc:identifier="${about}" dc:title="${rdfEscape(title)}"`,
    `    trackback:ping="${rdfEscape(trackbackUrl)}" />`,
    "</rdf:RDF>",
    "-->",
  ].join("\n");
}

/**
 * TrackBack 자동 발견 RDF(005 contracts/routes.md 글 상세). 서버 렌더링 HTML에 주석으로 넣어 다른 블로그 도구가
 * 글 주소에서 트랙백 주소를 찾게 한다. 화면에는 보이지 않는다. React는 주석을 그릴 수 없어 이스케이프한 문자열을 넣는다.
 */
export function TrackbackRdf(props: { postUrl: string; title: string; trackbackUrl: string }) {
  return (
    <div
      className="trackback-rdf"
      hidden
      // 값은 rdfEscape로 모두 이스케이프했고, 주석 밖으로 나갈 수 없다.
      dangerouslySetInnerHTML={{ __html: trackbackRdf(props) }}
    />
  );
}
