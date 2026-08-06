import type { QueryResult, RelatedEntity } from "./queryTypes";
import { apiGatewayBaseUrl, authHeaders } from "./apiGatewayClient";

export type { QueryResult, RelatedEntity } from "./queryTypes";

/** Citation snapshot so follow-ups survive AppSail conversation-store misses. */
export type FollowUpContext = {
  accusedId?: string | null;
  firId?: string | null;
  evidenceSources: string[];
  relatedFirs: string[];
  relatedEntities: RelatedEntity[];
};

/** Seeded ask (ACC or FIR) — optional conversationId continues the thread. */
export type SeededQueryInput =
  | {
      accusedId: string;
      firId?: null;
      conversationId?: string | null;
      followUp?: null;
      followUpContext?: null;
    }
  | {
      accusedId?: null;
      firId: string;
      conversationId?: string | null;
      followUp?: null;
      followUpContext?: null;
    };

/** Follow-up NL ask — conversationId + last-answer citation snapshot (mvp2/12 Step B). */
export type FollowUpQueryInput = {
  accusedId?: null;
  firId?: null;
  conversationId: string;
  followUp: string;
  followUpContext?: FollowUpContext | null;
};

export type QueryInput = SeededQueryInput | FollowUpQueryInput;

export async function askQuery(
  input: QueryInput,
  signal?: AbortSignal,
): Promise<QueryResult> {
  const followUp = input.followUp?.trim() || null;
  const conversationId = input.conversationId?.trim() || null;
  const accusedId =
    "accusedId" in input && input.accusedId != null ? input.accusedId.trim() || null : null;
  const firId = "firId" in input && input.firId != null ? input.firId.trim() || null : null;
  const followUpContext =
    "followUpContext" in input && input.followUpContext != null ? input.followUpContext : null;

  const hasAccused = accusedId != null;
  const hasFir = firId != null;
  if (hasAccused && hasFir) {
    throw new Error("Provide exactly one of accusedId or firId");
  }
  const hasSeed = hasAccused || hasFir;
  if (!hasSeed && !followUp) {
    throw new Error("Provide accusedId or firId, or a follow-up with conversationId");
  }
  if (!hasSeed && followUp && !conversationId) {
    throw new Error("Follow-up requires an existing conversation");
  }

  const base = apiGatewayBaseUrl();
  const url = `${base}/v1/queries:ask`;
  let res: Response;
  let headers: Headers;
  try {
    headers = authHeaders({ "Content-Type": "application/json" });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    if (/did not match the expected pattern/i.test(raw)) {
      throw new Error(
        "Q&A request failed (browser rejected the auth header). Sign out, sign in again, then retry. Prefer keep-warm before a cold demo.",
      );
    }
    throw new Error(`Q&A request failed (${raw}).`);
  }
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        accusedId: hasSeed ? accusedId : null,
        firId: hasSeed ? firId : null,
        conversationId,
        followUp: hasSeed ? null : followUp,
        followUpContext: hasSeed || !followUpContext ? null : followUpContext,
      }),
      signal,
    });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    if (/timed?\s*out|networkerror|failed to fetch/i.test(raw)) {
      throw new Error(
        "Q&A request failed (network/timeout). Run appsail-demo-keep-warm.sh --once, then Ask again.",
      );
    }
    // Safari often surfaces invalid URL/header issues as this opaque string.
    if (/did not match the expected pattern/i.test(raw)) {
      throw new Error(
        "Q&A request failed (browser rejected the request). Sign out, sign in again, then retry.",
      );
    }
    throw new Error(`Q&A request failed (${raw}).`);
  }

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = (await res.json()) as {
        error?: { message?: string };
        data?: { message?: string };
        message?: string;
      };
      if (body?.error?.message) detail = body.error.message;
      else if (body?.data?.message) detail = body.data.message;
      else if (body?.message) detail = body.message;
    } catch {
      /* ignore */
    }
    if (/read timed out|i\/o error|execution_time_exceeded|408/i.test(detail)) {
      throw new Error(
        "Q&A timed out waiting for Orchestration/Claude. Run ./appsail-demo-keep-warm.sh --once (includes Ask warm), then retry.",
      );
    }
    if (/No conversation for conversationId/i.test(detail)) {
      throw new Error(
        "Q&A session was lost on the server (AppSail recycle). Click Ask on the accused/FIR again, then retry the follow-up.",
      );
    }
    throw new Error(`Q&A request failed (${detail}).`);
  }

  return (await res.json()) as QueryResult;
}
