import { redirect } from "react-router";

/** 계정 설정 첫 화면은 프로필(contracts/routes.md) */
export const SETTINGS_HOME = "/settings/profile";

export function loader() {
  return redirect(SETTINGS_HOME);
}
