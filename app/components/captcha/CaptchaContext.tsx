import { createContext, useContext } from "react";

import type { CaptchaView } from "./captcha.server";

/**
 * 화면 loader가 읽은 CAPTCHA 정보(005 FR-141). 비회원 쓰기 폼(`GuestFields`)이 댓글·답글·방명록 어디에 있든
 * 속성을 여러 단계로 넘기지 않고 이 값으로 위젯을 그린다. 값이 없으면(회원, 비회원 쓰기 꺼짐) 그리지 않는다.
 */
export const CaptchaContext = createContext<CaptchaView | null>(null);

export function useCaptcha(): CaptchaView | null {
  return useContext(CaptchaContext);
}
