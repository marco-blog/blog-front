import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  name: string;
  /** 입력란 아래 안내 */
  hint?: ReactNode;
  /** 오류 문구. 있으면 aria-invalid와 함께 입력란 설명으로 읽힌다. */
  error?: string | null;
}

/** 라벨·안내·오류 문구를 입력란에 연결한 기본 입력란 */
export function FormField({ label, name, hint, error, ...input }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...input}
      />
      {error && (
        <p id={errorId} className="form-error">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="form-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

/** 폼 위 오류 */
export function FormAlert({ message }: { message: string | null | undefined }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="form-alert">
      {message}
    </p>
  );
}
