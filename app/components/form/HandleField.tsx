import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { api } from "~/api/client";
import { errorMessage } from "~/api/errorMessage";
import type { HandleAvailability, HandleUnavailableReason } from "~/api/models";
import { isValidHandle } from "~/blog/ids";

type Status = null | "checking" | "available" | HandleUnavailableReason;

/** 입력이 멈춘 뒤 확인까지 기다리는 시간 */
export const HANDLE_CHECK_DELAY_MS = 300;

export interface HandleFieldProps {
  label: string;
  hint?: string;
  /** action이 돌려준 오류 문구 */
  error?: string | null;
  defaultValue?: string;
  name?: string;
}

/**
 * 블로그 주소 입력란. 규칙(FR-002)에 맞지 않으면 바로 알리고, 맞으면 backend에 사용 가능 여부
 * (`GET /auth/handle-availability`: TAKEN·RESERVED·INVALID)를 물어 보여준다. 가입과 새 블로그 만들기에서 쓴다.
 * 확인 결과는 안내일 뿐이고, 최종 판단은 제출할 때 backend가 한다.
 */
export function HandleField({
  label,
  hint,
  error,
  defaultValue = "",
  name = "handle",
}: HandleFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [status, setStatus] = useState<Status>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      pending.current?.abort();
    },
    [],
  );

  async function check(handle: string) {
    const controller = new AbortController();
    pending.current = controller;
    try {
      const result = await api.get<HandleAvailability>("/auth/handle-availability", {
        query: { handle },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setStatus(result.available ? "available" : (result.reason ?? "INVALID"));
      }
    } catch {
      if (!controller.signal.aborted) {
        setStatus(null);
      }
    }
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setValue(next);
    clearTimeout(timer.current);
    pending.current?.abort();
    if (!next) {
      setStatus(null);
    } else if (!isValidHandle(next)) {
      setStatus("INVALID");
    } else {
      setStatus("checking");
      timer.current = setTimeout(() => void check(next), HANDLE_CHECK_DELAY_MS);
    }
  }

  let statusMessage: string | null = null;
  if (status === "checking") {
    statusMessage = t("auth:handle.checking");
  } else if (status === "available") {
    statusMessage = t("auth:handle.available");
  } else if (status) {
    statusMessage = errorMessage(t, `HANDLE_${status}`);
  }

  const ids = {
    error: `${id}-error`,
    status: `${id}-status`,
    hint: `${id}-hint`,
  };
  const describedBy = [error && ids.error, statusMessage && ids.status, hint && ids.hint]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        required
        maxLength={20}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={
          error || (status && status !== "checking" && status !== "available") ? true : undefined
        }
        aria-describedby={describedBy || undefined}
      />
      {error && (
        <p id={ids.error} className="form-error">
          {error}
        </p>
      )}
      <p id={ids.status} className="form-status" aria-live="polite">
        {statusMessage}
      </p>
      {hint && (
        <p id={ids.hint} className="form-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
