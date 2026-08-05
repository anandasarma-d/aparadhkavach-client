import type { QueryResult } from "./queryTypes";
import { apiGatewayBaseUrl, authHeaders } from "./apiGatewayClient";

export type { QueryResult, RelatedEntity } from "./queryTypes";

export type QueryInput =
  | { accusedId: string; firId?: null }
  | { accusedId?: null; firId: string };

export async function askQuery(
  input: QueryInput,
  signal?: AbortSignal,
): Promise<QueryResult> {
  const accusedId = input.accusedId?.trim() || null;
  const firId = input.firId?.trim() || null;
  if ((accusedId == null) === (firId == null)) {
    throw new Error("Provide exactly one of accusedId or firId");
  }

  const base = apiGatewayBaseUrl();
  const url = `${base}/v1/queries:ask`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ accusedId, firId }),
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
    throw new Error(`Q&A request failed (${detail}).`);
  }

  return (await res.json()) as QueryResult;
}
