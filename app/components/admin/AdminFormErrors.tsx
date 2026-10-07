import { useTranslation } from "react-i18next";

import { useFormMessages, type FormErrorData } from "~/api/formErrors";

/**
 * 콘솔 폼의 오류: 오류 코드 문구와 입력란별 문구("이름(日本語): 필수 입력 항목입니다.").
 * 입력란 이름(`names.ja`, `value.like` 등)은 `admin:fields.*`로 읽고, 모르는 이름은 그대로 보여준다.
 */
export function AdminFormErrors({ error }: { error: FormErrorData | null | undefined }) {
  const { t } = useTranslation();
  const messages = useFormMessages(error);
  const fields = Object.entries(messages.fields);
  if (!messages.form && fields.length === 0) {
    return null;
  }
  return (
    <div role="alert" className="form-alert">
      {messages.form && <p>{messages.form}</p>}
      {fields.length > 0 && (
        <ul>
          {fields.map(([field, message]) => (
            <li key={field}>
              {t(`admin:fields.${field}`, { defaultValue: field })}: {message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
