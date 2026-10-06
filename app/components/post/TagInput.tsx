import { useId, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

/** 글당 태그 수(FR-025) */
export const TAG_MAX = 10;
/** 태그 하나의 길이 */
export const TAG_MAX_LENGTH = 30;

/** backend `TagNormalizer`와 같은 규칙: 앞뒤 공백 제거 + 소문자(단어 사이 공백은 그대로) */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

/**
 * 태그 입력(FR-025). Enter·쉼표·"추가"로 넣고, 넣을 때 정규화해 보여준다.
 * 이미 있는 태그는 다시 넣지 않고, 10개가 차면 더 넣지 않는다(11번째는 안내만).
 */
export function TagInput({ value, onChange, disabled = false }: TagInputProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const hintId = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const tag = normalizeTag(text);
    if (!tag) {
      setText("");
      return;
    }
    if (tag.length > TAG_MAX_LENGTH) {
      setError(t("tag:input.tooLong", { maxLength: TAG_MAX_LENGTH }));
      return;
    }
    if (value.includes(tag)) {
      setText("");
      setError(null);
      return;
    }
    if (value.length >= TAG_MAX) {
      setError(t("tag:input.limit", { max: TAG_MAX }));
      return;
    }
    onChange([...value, tag]);
    setText("");
    setError(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === "Enter" || event.key === ",") && !event.nativeEvent.isComposing) {
      event.preventDefault();
      add();
    }
  }

  return (
    <div className="tag-input">
      <label htmlFor={inputId}>{t("tag:input.label")}</label>
      {value.length > 0 && (
        <ul className="tag-input-list" aria-label={t("tag:list.label")}>
          {value.map((tag) => (
            <li key={tag}>
              <span>#{tag}</span>{" "}
              <button
                type="button"
                disabled={disabled}
                aria-label={t("tag:input.remove", { tag })}
                onClick={() => {
                  onChange(value.filter((item) => item !== tag));
                  setError(null);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={inputId}
        value={text}
        disabled={disabled}
        placeholder={t("tag:input.placeholder")}
        aria-describedby={hintId}
        aria-invalid={error ? true : undefined}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />{" "}
      <button type="button" onClick={add} disabled={disabled}>
        {t("tag:input.add")}
      </button>
      <p id={hintId} className="field-hint">
        {t("tag:input.hint", { max: TAG_MAX, maxLength: TAG_MAX_LENGTH })}
      </p>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
