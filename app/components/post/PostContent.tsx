/**
 * 글 본문 표시. backend가 Markdown을 변환·살균한 `contentHtml`(research.md R8, R25)을
 * 그대로 넣는 유일한 곳이다(R27, eslint 예외 목록). 다른 곳에서는 HTML을 직접 넣지 않는다.
 */
export function PostContent({ html }: { html: string }) {
  return <div className="post-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
