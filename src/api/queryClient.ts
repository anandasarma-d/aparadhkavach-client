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
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ accusedId, firId }),
    signal,
  });

  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = body.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(`Q&A request failed (${detail}).`);
  }

  return (await res.json()) as QueryResult;
}
