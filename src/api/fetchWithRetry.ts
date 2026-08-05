/**
 * Retry Gateway feature calls that fail on AppSail cold start (D-063 / D-064).
 * Retries on 408 / 502 / 503 / 504 and network failures. Does not retry 4xx auth/validation.
 */

const RETRYABLE_STATUS = new Set([408, 502, 503, 504]);

export type FetchWithRetryOptions = {
  attempts?: number;
  /** Delay before attempt 2, then doubles (capped). */
  initialDelayMs?: number;
  signal?: AbortSignal;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = window.setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function fetchWithRetry(
  input: string,
  init: RequestInit | undefined,
  opts: FetchWithRetryOptions = {},
): Promise<Response> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  let delay = opts.initialDelayMs ?? 1500;
  let lastError: unknown;

  for (let i = 1; i <= attempts; i++) {
    if (opts.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      const res = await fetch(input, { ...init, signal: opts.signal });
      if (!RETRYABLE_STATUS.has(res.status) || i === attempts) {
        return res;
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (opts.signal?.aborted) throw err;
      if (i === attempts) throw err;
    }
    await sleep(delay, opts.signal);
    delay = Math.min(delay * 2, 8000);
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
