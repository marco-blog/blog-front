import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import type { Verification } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

export interface VerificationPanelProps {
  /** 발급한 코드(없으면 "코드 받기" 버튼) */
  verification: Verification | null;
  /** 코드를 넣을 피드 주소(발급·확인에 함께 보냄) */
  feedUrl: string;
  /** 폼마다 함께 보낼 숨은 값(단계·등록 id 등) */
  hidden?: Record<string, string>;
  /** 확인 실패 문구 */
  error?: string | null;
}

/**
 * 소유 인증(FR-110): 코드 발급 → 넣을 곳 안내·복사·만료 시각 → "확인". 발급·확인은 폼(`intent=issue-code`·`check`)이라 JS 없이 된다.
 * 복사 버튼만 JS가 있을 때 동작하고, 없으면 코드를 직접 고른다.
 */
export function VerificationPanel({
  verification,
  feedUrl,
  hidden = {},
  error,
}: VerificationPanelProps) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const [copied, setCopied] = useState(false);
  const fields = (
    <>
      <input type="hidden" name="feedUrl" value={feedUrl} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
  if (!verification) {
    return (
      <Form method="post" className="external-verify">
        {fields}
        <input type="hidden" name="intent" value="issue-code" />
        <button type="submit">{t("external:manage.verify.issue")}</button>
      </Form>
    );
  }
  if (verification.verifiedAt) {
    return (
      <p className="external-verify" role="status">
        {t("external:manage.verify.done")}
      </p>
    );
  }
  const copy = () => {
    void navigator.clipboard?.writeText(verification.code).then(() => setCopied(true));
  };
  return (
    <div className="external-verify">
      <p>
        <span>{t("external:manage.verify.code")}</span>{" "}
        <code className="verification-code">{verification.code}</code>{" "}
        <button type="button" onClick={copy}>
          {t("external:manage.verify.copy")}
        </button>
        {copied && <span role="status"> {t("external:manage.verify.copied")}</span>}
      </p>
      <p>{t("external:manage.verify.where")}</p>
      <p>
        {t("external:manage.verify.expires", { time: format.dateTime(verification.expiresAt) })}
      </p>
      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}
      <Form method="post">
        {fields}
        <input type="hidden" name="intent" value="check" />
        <input type="hidden" name="verificationId" value={verification.id} />
        <input type="hidden" name="code" value={verification.code} />
        <input type="hidden" name="expiresAt" value={verification.expiresAt} />
        <button type="submit">{t("external:manage.verify.check")}</button>
      </Form>
    </div>
  );
}
