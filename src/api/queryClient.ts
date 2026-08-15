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
        "Q&A timed out while assembling the answer. Run ./appsail-demo-keep-warm.sh --once, then retry.",
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

/** Create an empty conversation thread (Design Flow 2 — voice seed needs an id). */
export async function createConversation(signal?: AbortSignal): Promise<string> {
  const base = apiGatewayBaseUrl();
  const url = `${base}/v1/conversations`;
  const headers = authHeaders({ "Content-Type": "application/json" });
  const res = await fetch(url, { method: "POST", headers, signal });
  if (!res.ok) {
    throw new Error(`Could not start a Q&A thread (${res.status}). Sign in again, then retry.`);
  }
  const body = (await res.json()) as { conversationId?: string };
  if (!body.conversationId) {
    throw new Error("Could not start a Q&A thread (missing conversationId).");
  }
  return body.conversationId;
}

/**
 * ChatPanel voice (mvp2/12 Step H / Design Flow 2) — multipart audio → STT → same Graph-RAC ask
 * path. Empty thread + spoken ACC-/FIR- seeds; otherwise follow-up resolution.
 */
export async function askVoice(
  input: {
    conversationId?: string | null;
    audio: Blob;
    filename?: string;
    languageHint?: string;
    followUpContext?: FollowUpContext | null;
  },
  signal?: AbortSignal,
): Promise<QueryResult> {
  let conversationId = input.conversationId?.trim() || "";
  if (!conversationId) {
    conversationId = await createConversation(signal);
  }
  if (!input.audio || input.audio.size < 256) {
    throw new Error("Recording too short — hold the mic and speak briefly (under ~30s)");
  }

  const form = new FormData();
  form.append(
    "audio",
    input.audio,
    input.filename || (input.audio.type.includes("webm") ? "chat.webm" : "chat.wav"),
  );
  form.append("languageHint", input.languageHint?.trim() || "en");
  if (input.followUpContext) {
    form.append("followUpContext", JSON.stringify(input.followUpContext));
  }

  const base = apiGatewayBaseUrl();
  const url = `${base}/v1/conversations/${encodeURIComponent(conversationId)}/queries:voice`;
  let headers: Headers;
  try {
    headers = authHeaders();
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(`Voice ask failed (${raw}). Sign in again, then retry.`);
  }

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body: form, signal });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    if (/timed?\s*out|networkerror|failed to fetch/i.test(raw)) {
      throw new Error(
        "Voice ask failed (network). Ensure STT is up, or type your question instead.",
      );
    }
    throw new Error(`Voice ask failed (${raw}).`);
  }

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = (await res.json()) as {
        error?: { message?: string };
        data?: { message?: string };
        message?: string;
        detail?: string;
      };
      if (body?.error?.message) detail = body.error.message;
      else if (body?.data?.message) detail = body.data.message;
      else if (body?.message) detail = body.message;
      else if (body?.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    if (/Speech-to-text|STT|503|unavailable/i.test(detail)) {
      throw new Error(
        "Speech-to-text is temporarily unavailable. Type your question instead.",
      );
    }
    throw new Error(`Voice ask failed (${detail}).`);
  }

  return (await res.json()) as QueryResult;
}

/** @deprecated Use {@link askVoice} — kept for any external imports. */
export async function askVoiceFollowUp(
  input: {
    conversationId: string;
    audio: Blob;
    filename?: string;
    languageHint?: string;
    followUpContext?: FollowUpContext | null;
  },
  signal?: AbortSignal,
): Promise<QueryResult> {
  return askVoice(input, signal);
}
