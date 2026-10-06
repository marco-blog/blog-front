import { useEffect, useRef } from "react";

/**
 * 끝까지 읽음 신호(003 FR-086, research P4, 결정 표 16번). 본문 끝의 감시 요소가 화면에 들어오면
 * `POST /api/v1/posts/{id}/read-complete`를 한 번만 보낸다(같은 출처라 front 서버가 backend로 넘긴다).
 * `IntersectionObserver`가 없거나 JS가 없으면 보내지 않는다(받아들인 한계). 실패는 무시한다.
 */
export function ReadCompleteTracker({ postId }: { postId: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = ref.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      return;
    }
    let sent = false;
    const observer = new IntersectionObserver((entries) => {
      if (sent || !entries.some((entry) => entry.isIntersecting)) {
        return;
      }
      sent = true;
      observer.disconnect();
      fetch(`/api/v1/posts/${postId}/read-complete`, {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      }).catch(() => undefined);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [postId]);

  return <div ref={ref} className="read-complete-sentinel" aria-hidden="true" />;
}
