import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

const noSubscribe = () => () => undefined;

/**
 * 이 글의 트랙백 주소(005 FR-049). 선택할 수 있는 읽기 전용 입력란이라 JS가 없어도 복사할 수 있고, JS가 있으면
 * "복사" 버튼을 함께 보인다. 주소가 없으면(비공개·보호 글, 트랙백을 끈 블로그) "트랙백을 받지 않는 글".
 */
export function TrackbackUrlBox({ url }: { url: string | null | undefined }) {
  const { t } = useTranslation();
  // 서버 렌더링(JS 없음)에는 버튼 없이, 브라우저에 클립보드가 있으면 버튼을 보인다.
  const canCopy = useSyncExternalStore(
    noSubscribe,
    () => navigator.clipboard !== undefined,
    () => false,
  );
  const [copied, setCopied] = useState(false);

  if (!url) {
    return <p className="trackback-closed">{t("trackback:closed")}</p>;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url!);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="trackback-url">
      <label htmlFor="trackback-url">{t("trackback:address")}</label>{" "}
      <input
        id="trackback-url"
        type="text"
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
      />
      {canCopy && (
        <button type="button" onClick={copy}>
          {t("trackback:copy")}
        </button>
      )}
      <span role="status" className="form-hint">
        {copied ? t("trackback:copied") : ""}
      </span>
    </div>
  );
}
