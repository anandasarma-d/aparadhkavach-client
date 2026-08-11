import type { FirTextSearch, SimilarCases } from "./similarCasesTypes";
import { apiGatewayBaseUrl, authHeaders } from "./apiGatewayClient";
import { fetchWithRetry } from "./fetchWithRetry";

export type { FirTextSearch, SimilarCase, SimilarCases } from "./similarCasesTypes";

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

/** Typed narrative → embed → ANN (GET /v1/firs/search — under Gateway /v1/firs/**). */
export async function searchSimilarByText(
  query: string,
  limit: number = DEFAULT_LIMIT,
  signal?: AbortSignal,
): Promise<FirTextSearch> {
  const q = query.trim();
  if (!q) {
    throw new Error("Search text is required");
  }
  if (q.split(/\s+/).length < 2 || q.length < 12) {
    throw new Error(
      "Use a short narrative (e.g. vehicle theft from parking lot), not a single word like “theft”.",
    );
  }
  const clamped = Math.min(Math.max(Math.round(limit), 1), MAX_LIMIT);
  const base = apiGatewayBaseUrl();
  const url = `${base}/v1/firs/search?q=${encodeURIComponent(q)}&limit=${clamped}`;

  // Cold Voyage+ANN via Gateway often 500/408 once; retry like FIR similar (D-064).
  const maxAttempts = 3;
  let lastStatus = 0;
  let lastDetail = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const res = await fetch(url, { headers: authHeaders(), signal });
    lastStatus = res.status;
    if (res.ok) {
      const raw = await res.text();
      if (!raw.trim()) {
        lastDetail = "empty body";
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }
        throw new Error(
          "Narrative search returned empty (cold Orch). Run ./appsail-demo-keep-warm.sh --once, then retry.",
        );
      }
      return JSON.parse(raw) as FirTextSearch;
    }
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      lastDetail = body?.error?.message ?? "";
    } catch {
      lastDetail = "";
    }
    const retryable =
      res.status === 408 ||
      res.status === 500 ||
      res.status === 502 ||
      res.status === 503 ||
      res.status === 504;
    if (!retryable || attempt === maxAttempts) {
      break;
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }

  if (lastStatus === 503) {
    throw new Error(
      "Similar-cases store is warming up. Wait ~30s after Orch restart, run keep-warm, then retry.",
    );
  }
  if (lastStatus === 400) {
    throw new Error(
      "Use a short narrative (e.g. vehicle theft from parking lot), not a single crime-type word.",
    );
  }
  if (/timed out|execution_time|i\/o error|jdbc|unavailable/i.test(lastDetail)) {
    throw new Error(
      "Narrative search timed out or store was cold. Run keep-warm, then Find similar again within a minute.",
    );
  }
  throw new Error(
    `Could not search similar cases (${lastStatus}${lastDetail ? `: ${lastDetail}` : ""}). Warm Orch, then retry.`,
  );
}
