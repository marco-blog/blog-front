import type { Resource } from "i18next";

import type { Language } from "./config";

/** root loader가 넘기는 언어 정보. 서버와 브라우저가 같은 리소스로 렌더링한다. */
export interface RootLoaderData {
  language: Language;
  resources: Resource;
}
