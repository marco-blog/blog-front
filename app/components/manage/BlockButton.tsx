import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

export interface BlockButtonProps {
  userId: number;
  nickname: string;
}

/**
 * 블로그 관리의 회원 차단 버튼(004 FR-146). 회원 작성자에게만 보인다. 브라우저에서는 한 번 더 묻는다(JS가 없으면 바로 보낸다).
 * 차단하면 그 회원은 이 블로그에 댓글·방명록을 쓰거나 구독할 수 없고, 구독 중이면 구독이 풀린다. 이미 쓴 글은 남는다.
 */
export function BlockButton({ userId, nickname }: BlockButtonProps) {
  const { t } = useTranslation();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(t("manage:blocks.confirm", { nickname }))) {
      event.preventDefault();
    }
  };
  return (
    <Form method="post" className="block-user" onSubmit={onSubmit}>
      <input type="hidden" name="intent" value="block" />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="nickname" value={nickname} />
      <button type="submit" aria-label={t("manage:blocks.blockUser", { nickname })}>
        {t("manage:blocks.block")}
      </button>
    </Form>
  );
}
