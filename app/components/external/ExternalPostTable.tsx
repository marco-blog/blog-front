import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import type { MyExternalPost, TopicNode } from "~/api/models";
import { topicLabel } from "~/external/topics";
import { useDateFormat } from "~/i18n/format";

import { TopicSelect } from "./TopicSelect";

export interface ExternalPostTableProps {
  posts: MyExternalPost[];
  topics: TopicNode[];
  /** 인증된 주인이면 글마다 주제 바꾸기 폼(`intent=post-topic`)을 보인다 */
  editable: boolean;
  /** 폼을 보낼 주소(상세 화면) */
  action: string;
}

/**
 * 수집된 글 표(007 T070): 제목(원문 새 탭), 발행, 주제와 출처 배지(주인·검수·규칙·자동·기본), 상태, 클릭. 인증된 주인에게는 ACTIVE 글마다
 * 주제 바꾸기 폼이 붙는다(JS 없이 동작). 제목은 외부에서 온 일반 텍스트라 이스케이프 출력만 한다.
 */
export function ExternalPostTable({ posts, topics, editable, action }: ExternalPostTableProps) {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  return (
    <table className="manage-table" aria-label={t("external:manage.detail.posts")}>
      <thead>
        <tr>
          <th>{t("external:common.title")}</th>
          <th>{t("external:common.publishedAt")}</th>
          <th>{t("external:common.topic")}</th>
          <th>{t("external:common.status")}</th>
          <th>{t("external:common.clicks")}</th>
        </tr>
      </thead>
      <tbody>
        {posts.map((post) => (
          <tr key={post.id}>
            <td>
              <a
                href={post.link}
                target="_blank"
                rel="noopener nofollow noreferrer"
                title={t("external:common.newTab")}
              >
                {post.title}
              </a>
            </td>
            <td>{post.publishedAt ? format.dateTime(post.publishedAt) : "-"}</td>
            <td>
              {topicLabel(topics, post.topicId, i18n.language)}{" "}
              <span className={`topic-source topic-source-${post.topicSource.toLowerCase()}`}>
                {t(`external:topicSource.${post.topicSource}`)}
              </span>
              {editable && post.status === "ACTIVE" && (
                <Form method="post" action={action} className="external-post-topic-form">
                  <input type="hidden" name="intent" value="post-topic" />
                  <input type="hidden" name="postId" value={post.id} />
                  <TopicSelect
                    topics={topics}
                    name="topicId"
                    defaultValue={post.topicId}
                    label={t("external:manage.detail.postTopicFor", { title: post.title })}
                  />
                  <button type="submit">{t("external:common.change")}</button>
                </Form>
              )}
            </td>
            <td>
              {t(`external:postStatus.${post.status}`)}
              {post.removedReason && ` · ${t(`external:removedReason.${post.removedReason}`)}`}
            </td>
            <td>{format.number(post.clickCount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
