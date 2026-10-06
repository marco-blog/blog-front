import type { Config } from "@react-router/dev/config";

export default {
  // 공개 페이지는 서버 렌더링한다(헌법 원칙 V).
  ssr: true,
} satisfies Config;
