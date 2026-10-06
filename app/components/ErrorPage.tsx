import { useTranslation } from "react-i18next";

export interface ErrorPageProps {
  /** API 오류 코드(errors.{code}). 없으면 일반 안내 문구 */
  message?: string;
  /** 개발 환경에서만 보여주는 스택 */
  stack?: string;
}

/** 404 외의 오류 화면 */
export function ErrorPage({ message, stack }: ErrorPageProps) {
  const { t } = useTranslation();
  return (
    <main>
      <h1>{t("error.title")}</h1>
      <p>{message ?? t("error.description")}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
