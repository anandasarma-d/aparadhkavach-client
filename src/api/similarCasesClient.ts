import type { SimilarCases } from "./similarCasesTypes";
import { apiGatewayBaseUrl, authHeaders } from "./apiGatewayClient";
import { fetchWithRetry } from "./fetchWithRetry";

export type { SimilarCase, SimilarCases } from "./similarCasesTypes";

/** Server default 5 / max 10 (Auto/18); keep the client honest about the same range. */
export const DEFAULT_LIMIT = 5;
export const MAX_LIMIT = 10;

export class FirNotFoundError extends Error {
  constructor(firId: string) {
    super(`No embedding for ${firId}`);
    this.name = "FirNotFoundError";
  }
}

export async function fetchSimilarCases(
  firId: string,
  limit: number = DEFAULT_LIMIT,
  signal?: AbortSignal,
): Promise<SimilarCases> {
  const id = firId.trim();
  if (!id) {
    throw new Error("firId is required");
  }
  const clamped = Math.min(Math.max(Math.round(limit), 1), MAX_LIMIT);

  const base = apiGatewayBaseUrl();
  const url = `${base}/v1/firs/${encodeURIComponent(id)}/similarCases?limit=${clamped}`;
  const res = await fetchWithRetry(
    url,
    { headers: authHeaders() },
    { signal, attempts: 3 },
  );

  if (res.status === 404) {
    throw new FirNotFoundError(id);
  }
  if (!res.ok) {
    throw new Error(`Could not load similar cases for ${id} (${res.status}).`);
  }

  return (await res.json()) as SimilarCases;
}
