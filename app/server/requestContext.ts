import { RouterContextProvider, createContext } from "react-router";

/** 보안 헤더 미들웨어가 정한 요청별 CSP nonce. entry.server가 스크립트에 붙인다. */
export const cspNonceContext = createContext<string | undefined>(undefined);

/** Express 요청마다 React Router에 넘기는 load context */
export function createLoadContext(cspNonce: string | undefined): RouterContextProvider {
  const context = new RouterContextProvider();
  context.set(cspNonceContext, cspNonce);
  return context;
}
