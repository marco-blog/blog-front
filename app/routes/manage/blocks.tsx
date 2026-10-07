import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Form, useActionData, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { errorMessage } from "~/api/errorMessage";
import type { BlockedUser } from "~/api/models";
import { parsePage, withPage } from "~/blog/listing";
import { FormAlert } from "~/components/form/FormField";
import { Avatar } from "~/components/media/Avatar";
import { Pagination } from "~/components/Pagination";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import type { BlockActionData } from "~/manage/blocks";
import { runBlockAction } from "~/manage/blocks.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/blocks";

/** 한 페이지 차단 수(backend 기본값과 같다) */
export const BLOCKS_PAGE_SIZE = 20;

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("manage:blocks.title"), t("appName"));
}

/** 차단 목록(`/:handle/manage/blocks?page=`, SSR, 004 FR-146): 차단한 회원(닉네임·프로필)과 차단 시각, "해제" */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const blocks = await createApiClient(request)
    .send<BlockedUser[]>(`/blogs/${handle}/blocks`, {
      query: { page: page - 1, size: BLOCKS_PAGE_SIZE },
    })
    .catch(throwManageError);
  return {
    handle,
    page,
    blocks: blocks.result,
    totalCount: blocks.totalCount ?? blocks.result.length,
  };
}

/** 해제(`intent=unblock` → `DELETE /blogs/{handle}/blocks/{userId}`). 끝나면 loader가 목록을 다시 읽는다. */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  return runBlockAction(request, handle);
}

export default function ManageBlocks() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { handle, page, blocks, totalCount } = useLoaderData<typeof loader>();
  const result = useActionData<BlockActionData>();
  const onUnblock = (nickname: string) => (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(t("manage:blocks.unblockConfirm", { nickname }))) {
      event.preventDefault();
    }
  };

  return (
    <main className="manage-blocks">
      <h1>{t("manage:blocks.title")}</h1>
      <p>{t("manage:blocks.description")}</p>
      {result?.ok && (
        <p role="status">
          {t(result.intent === "unblock" ? "manage:blocks.unblocked" : "manage:blocks.blocked", {
            nickname: result.nickname ?? "",
          })}
        </p>
      )}
      <FormAlert message={result && !result.ok ? errorMessage(t, result) : null} />
      {blocks.length === 0 ? (
        <p>{t("manage:blocks.empty")}</p>
      ) : (
        <ul className="block-list" aria-label={t("manage:blocks.list")}>
          {blocks.map((block) => (
            <li key={block.user.userId}>
              <Avatar url={block.user.profileImageUrl} /> <strong>{block.user.nickname}</strong>{" "}
              <span>
                {t("manage:blocks.blockedAt", { time: format.dateTime(block.blockedAt) })}
              </span>
              <Form method="post" onSubmit={onUnblock(block.user.nickname)}>
                <input type="hidden" name="intent" value="unblock" />
                <input type="hidden" name="userId" value={block.user.userId} />
                <input type="hidden" name="nickname" value={block.user.nickname} />
                <button
                  type="submit"
                  aria-label={t("manage:blocks.unblockUser", { nickname: block.user.nickname })}
                >
                  {t("manage:blocks.unblock")}
                </button>
              </Form>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={BLOCKS_PAGE_SIZE}
        hrefFor={(target) => withPage(`/${handle}/manage/blocks`, target)}
      />
    </main>
  );
}
