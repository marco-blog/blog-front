import { useTranslation } from "react-i18next";
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { fieldErrorMessages } from "~/api/errorMessage";
import { VALIDATION_FAILED } from "~/api/formErrors";
import type {
  FeedPreview as FeedPreviewData,
  MyExternalBlog,
  TopicNode,
  Verification,
} from "~/api/models";
import { FeedPreview } from "~/components/external/FeedPreview";
import { TopicSelect } from "~/components/external/TopicSelect";
import { VerificationPanel } from "~/components/external/VerificationPanel";
import { FormAlert } from "~/components/form/FormField";
import { externalActionError, formId, formText, invalidField } from "~/external/actions.server";
import { externalErrorMessage, type ExternalFormError } from "~/external/status";
import { verificationFromForm } from "~/external/verification";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/external-blog-new";

export type NewExternalBlogStep = "preview" | "verify" | "topic";
const STEPS: readonly NewExternalBlogStep[] = ["preview", "verify", "topic"];

/** 화면 상태: loader(`?step=&feedUrl=&verificationId=`) 또는 action 결과 */
export interface NewExternalBlogState {
  step: NewExternalBlogStep;
  url: string;
  feedUrl: string;
  verificationId: number | null;
  preview: FeedPreviewData | null;
  verification: Verification | null;
  intent: string | null;
  error: ExternalFormError | null;
}

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("external:manage.new.title"), t("appName"));
}

function parseStep(value: string | null): NewExternalBlogStep {
  return (STEPS as readonly string[]).includes(value ?? "")
    ? (value as NewExternalBlogStep)
    : "preview";
}

/**
 * 외부 블로그 등록 신청(`/:handle/manage/external-blogs/new`, 007 T040, contracts/routes.md): (1) 주소 → 미리보기,
 * (2) 소유 인증(선택) 또는 건너뛰기, (3) 기본 주제 → 신청. 단계는 `?step=`와 숨은 입력으로 이어 가므로 JS 없이 된다.
 * 주소가 없는 단계 링크는 첫 단계로 돌아간다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const search = new URL(request.url).searchParams;
  const feedUrl = (search.get("feedUrl") ?? "").trim();
  let step = parseStep(search.get("step"));
  if (!feedUrl) {
    step = "preview";
  }
  const verificationId = Number(search.get("verificationId"));
  const topics =
    step === "topic"
      ? await createApiClient(request).get<TopicNode[]>("/topics").catch(throwManageError)
      : [];
  const state: NewExternalBlogState = {
    step,
    url: "",
    feedUrl,
    verificationId:
      Number.isSafeInteger(verificationId) && verificationId > 0 ? verificationId : null,
    preview: null,
    verification: null,
    intent: null,
    error: null,
  };
  return { handle, topics, state };
}

/** `intent=preview|issue-code|check|submit|claim`(contracts/routes.md). 신청·넘겨받기가 끝나면 상세로 */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const api = createApiClient(request);
  const form = await request.formData();
  const intent = formText(form, "intent");
  const feedUrl = formText(form, "feedUrl");
  const verificationId = formId(form, "verificationId");
  const base: NewExternalBlogState = {
    step: "preview",
    url: formText(form, "url"),
    feedUrl,
    verificationId,
    preview: null,
    verification: null,
    intent,
    error: null,
  };
  const fail = (error: unknown, state: Partial<NewExternalBlogState>) =>
    externalActionError(intent, error, { state: { ...base, ...state } });

  switch (intent) {
    case "preview":
      try {
        const preview = await api.post<FeedPreviewData>("/external-blog-previews", {
          body: { url: base.url },
        });
        return {
          intent,
          ok: true as const,
          state: { ...base, step: "verify" as const, feedUrl: preview.feedUrl, preview },
        };
      } catch (error) {
        return fail(error, { step: "preview" });
      }
    case "issue-code":
      try {
        const verification = await api.post<Verification>("/me/external-blog-verifications", {
          body: { feedUrl },
        });
        return {
          intent,
          ok: true as const,
          state: { ...base, step: "verify" as const, verification },
        };
      } catch (error) {
        return fail(error, { step: "verify" });
      }
    case "check": {
      if (verificationId === null) {
        return fail(invalidField("verificationId"), { step: "verify" });
      }
      try {
        const verification = await api.post<Verification>(
          `/me/external-blog-verifications/${verificationId}/check`,
          { body: { feedUrl } },
        );
        return {
          intent,
          ok: true as const,
          state: { ...base, step: "verify" as const, verification },
        };
      } catch (error) {
        return fail(error, { step: "verify", verification: verificationFromForm(form) });
      }
    }
    case "submit":
      try {
        const created = await api.post<MyExternalBlog>("/me/external-blogs", {
          body: {
            feedUrl,
            defaultTopicId: formId(form, "defaultTopicId"),
            verificationId,
          },
        });
        throw redirect(`/${handle}/manage/external-blogs/${created.id}`);
      } catch (error) {
        if (error instanceof Response) {
          throw error;
        }
        return fail(error, { step: "topic" });
      }
    case "claim": {
      const externalBlogId = formId(form, "externalBlogId");
      try {
        const claimed = await api.post<MyExternalBlog>(
          `/external-blogs/${externalBlogId ?? 0}/claim`,
          {
            body: { verificationId },
          },
        );
        throw redirect(`/${handle}/manage/external-blogs/${claimed.id}`);
      } catch (error) {
        if (error instanceof Response) {
          throw error;
        }
        return fail(error, { step: "verify" });
      }
    }
    default:
      return fail(invalidField("intent"), { step: "preview" });
  }
}

export default function ManageExternalBlogNew() {
  const { t } = useTranslation();
  const { handle, topics, state: loaded } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const state: NewExternalBlogState = result?.state
    ? (result.state as NewExternalBlogState)
    : loaded;
  const error = result && !result.ok ? (result.error as ExternalFormError) : null;
  const message = error ? externalErrorMessage(t, error) : null;
  const fields =
    error?.resultCode === VALIDATION_FAILED ? fieldErrorMessages(t, error.fieldErrors) : {};
  const base = `/${handle}/manage/external-blogs`;
  const newPath = `${base}/new`;
  const stepHref = (step: NewExternalBlogStep, verificationId?: number | null) => {
    const query = new URLSearchParams({ step, feedUrl: state.feedUrl });
    if (verificationId) {
      query.set("verificationId", String(verificationId));
    }
    return `${newPath}?${query}`;
  };
  const registered = state.preview?.registered ?? null;
  const verification = state.verification;
  const verified = Boolean(verification?.verifiedAt);
  const claimId =
    verification?.claimableExternalBlogId ??
    (registered?.claimable ? registered.externalBlogId : null);
  const alreadyRegistered = error?.resultCode === "EXTERNAL_BLOG_ALREADY_REGISTERED";

  return (
    <main className="manage-external-blog-new">
      <p>
        <Link to={base}>{t("external:manage.detail.back")}</Link>
      </p>
      <h1>{t("external:manage.new.title")}</h1>
      <ol className="steps" aria-label={t("external:manage.new.steps")}>
        {STEPS.map((step) => (
          <li key={step} aria-current={step === state.step ? "step" : undefined}>
            {t(`external:manage.new.step${step.charAt(0).toUpperCase()}${step.slice(1)}`)}
          </li>
        ))}
      </ol>

      {state.step === "preview" && (
        <Form method="post" action={newPath} className="external-url-form">
          <input type="hidden" name="intent" value="preview" />
          <label htmlFor="external-url">{t("external:manage.new.url")}</label>
          <input
            id="external-url"
            name="url"
            type="text"
            inputMode="url"
            required
            maxLength={1000}
            defaultValue={state.url}
            aria-describedby="external-url-hint"
          />
          <p id="external-url-hint" className="field-hint">
            {t("external:manage.new.urlHint")}
          </p>
          <FormAlert message={fields.url ?? message} />
          <button type="submit">{t("external:manage.new.preview")}</button>
        </Form>
      )}

      {state.step === "verify" && (
        <section className="external-step-verify">
          {state.preview && <FeedPreview preview={state.preview} />}
          {registered && (registered.mine || !registered.claimable) ? (
            <p>
              <Link to={newPath}>{t("external:manage.new.startOver")}</Link>
            </p>
          ) : (
            <>
              <h2>{t("external:manage.new.verifyTitle")}</h2>
              <p>{t("external:manage.new.verifyIntro")}</p>
              <VerificationPanel
                verification={verification}
                feedUrl={state.feedUrl}
                error={state.intent === "check" || state.intent === "issue-code" ? message : null}
              />
              {verified && claimId !== null && (
                <Form method="post" action={newPath}>
                  <input type="hidden" name="intent" value="claim" />
                  <input type="hidden" name="externalBlogId" value={claimId} />
                  <input type="hidden" name="verificationId" value={verification?.id ?? ""} />
                  <input type="hidden" name="feedUrl" value={state.feedUrl} />
                  <p>{t("external:manage.new.claimHint")}</p>
                  {state.intent === "claim" && <FormAlert message={message} />}
                  <button type="submit">{t("external:manage.new.claim")}</button>
                </Form>
              )}
              {verified && claimId === null && (
                <p>
                  <Link className="button" to={stepHref("topic", verification?.id)}>
                    {t("external:manage.new.next")}
                  </Link>
                </p>
              )}
              {!verified && !registered && (
                <p>
                  <Link to={stepHref("topic")}>{t("external:manage.new.skip")}</Link>
                </p>
              )}
              <p>
                <Link to={newPath}>{t("external:manage.new.startOver")}</Link>
              </p>
            </>
          )}
        </section>
      )}

      {state.step === "topic" && (
        <Form method="post" action={newPath} className="external-step-topic">
          <input type="hidden" name="intent" value="submit" />
          <input type="hidden" name="feedUrl" value={state.feedUrl} />
          {state.verificationId !== null && (
            <input type="hidden" name="verificationId" value={state.verificationId} />
          )}
          <h2>{t("external:manage.new.topicTitle")}</h2>
          <p>
            {t("external:common.feedUrl")}: <code>{state.feedUrl}</code>
          </p>
          <TopicSelect
            topics={topics}
            hint={t("external:manage.new.topicHint")}
            error={fields.defaultTopicId ?? null}
          />
          <FormAlert message={error && !fields.defaultTopicId ? message : null} />
          {alreadyRegistered && error?.params?.claimable === true && error.params.mine !== true && (
            <p>
              <Link to={stepHref("verify")}>{t("external:manage.new.verifyTitle")}</Link>
            </p>
          )}
          <button type="submit">{t("external:manage.new.submit")}</button>
          <p>
            <Link to={newPath}>{t("external:manage.new.startOver")}</Link>
          </p>
        </Form>
      )}
    </main>
  );
}
