import { useEffect, useState, type KeyboardEvent } from "react";
import {
  DEFAULT_LIMIT,
  FirNotFoundError,
  MAX_LIMIT,
  fetchSimilarCases,
  type SimilarCases,
} from "./api/similarCasesClient";
import { DEMO_FIRS } from "./lib/demoFirs";

const LIMIT_OPTIONS = [5, 10] as const;

/**
 * The endpoint probes a FIR's *stored* vector, so the input must be a FIR id —
 * free text ("vehicle theft") would need a Voyage embed on the read path, which
 * is deliberately out of MVP-1 (Auto/18). Guard here so that mistake reads as a
 * hint rather than a raw 400/404 from the Gateway.
 */
const FIR_ID_PATTERN = /^FIR-[A-Za-z0-9_-]+$/i;

type SimilarCasesPageProps = {
  /** FIR to load on mount — set when arriving from the Network view. */
  initialFirId?: string | null;
};

export function SimilarCasesPage({ initialFirId = null }: SimilarCasesPageProps) {
  const [query, setQuery] = useState(initialFirId ?? "");
  const [firId, setFirId] = useState<string | null>(initialFirId);
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);
  const [result, setResult] = useState<SimilarCases | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rejectedInput, setRejectedInput] = useState<string | null>(null);

  useEffect(() => {
    if (initialFirId) {
      setQuery(initialFirId);
      setFirId(initialFirId);
    }
  }, [initialFirId]);

  useEffect(() => {
    if (!firId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setNotFound(false);

    fetchSimilarCases(firId, limit, controller.signal)
      .then((data) => {
        setResult(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setResult(null);
        setLoading(false);
        if (err instanceof FirNotFoundError) {
          setNotFound(true);
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => controller.abort();
  }, [firId, limit]);

  function runLookup() {
    const candidate = query.trim().toUpperCase();
    if (!candidate) return;

    if (!FIR_ID_PATTERN.test(candidate)) {
      setRejectedInput(query.trim());
      setResult(null);
      setError(null);
      setNotFound(false);
      return;
    }

    setRejectedInput(null);
    setQuery(candidate);
    setFirId(candidate);
  }

  function pickDemoFir(id: string) {
    setRejectedInput(null);
    setQuery(id);
    setFirId(id);
  }

  function onQueryChange(value: string) {
    setQuery(value);
    if (rejectedInput) setRejectedInput(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      runLookup();
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-7 py-8">
      <header className="mb-7 max-w-2xl">
        <h1
          className="font-[family-name:var(--font-display)] text-[2rem] leading-tight text-[var(--ink)]"
          style={{ fontWeight: 400 }}
        >
          Semantically similar FIRs
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-muted)]">
          Nearest past FIRs by <strong className="font-semibold text-[var(--ink)]">narrative
          embedding</strong> (Voyage vectors, cosine similarity). This surfaces cases that read
          alike — often the same modus operandi across districts. Ranking is the raw similarity
          score only; no case-outcome claim or AI comparison is implied.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        <div className="min-w-[240px] flex-1">
          <label className="sr-only" htmlFor="fir-search">
            FIR id (FIR-NNNNNN)
          </label>
          <input
            id="fir-search"
            value={query}
            list="similar-demo-firs"
            placeholder="FIR id — e.g. FIR-002683"
            autoComplete="off"
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-full rounded border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-[11px] text-[14.5px] text-[var(--ink)] shadow-[var(--shadow)] outline-none placeholder:text-[var(--ink-faint)]"
          />
          <datalist id="similar-demo-firs">
            {DEMO_FIRS.map((f) => (
              <option key={f.firId} value={f.firId}>
                {f.crimeHint} · {f.districtHint}
              </option>
            ))}
          </datalist>
        </div>

        <fieldset className="flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5">
          <legend className="sr-only">Result count (max {MAX_LIMIT})</legend>
          <span className="px-1 text-[12px] text-[var(--ink-muted)]">Top</span>
          {LIMIT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={limit === n}
              onClick={() => setLimit(n)}
              className={
                limit === n
                  ? "rounded bg-[var(--accent-soft)] px-2.5 py-1 text-[13px] font-semibold text-[var(--accent-ink)]"
                  : "rounded px-2.5 py-1 text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }
            >
              {n}
            </button>
          ))}
        </fieldset>

        <button
          type="button"
          onClick={runLookup}
          className="rounded border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2.5 text-[13px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Find similar
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[11.5px] uppercase tracking-wide text-[var(--ink-faint)]">Try</span>
        {DEMO_FIRS.map((f) => (
          <button
            key={f.firId}
            type="button"
            onClick={() => pickDemoFir(f.firId)}
            title={`${f.crimeHint} · ${f.districtHint}`}
            className={`rounded-full border px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11.5px] transition-colors ${
              firId === f.firId
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
            }`}
          >
            {f.firId}
          </button>
        ))}
      </div>

      {rejectedInput && (
        <div
          className="rounded border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-4"
          role="status"
        >
          <p className="text-[13.5px] font-semibold text-[var(--ink)]">
            “{rejectedInput}” is not a FIR id
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-muted)]">
            This view starts from one case and finds the FIRs whose narratives are closest to it, so
            it needs an id such as{" "}
            <span className="font-[family-name:var(--font-mono)]">FIR-002683</span>. Searching by
            crime type or free text is not part of MVP-1 — pick one of the ids above to see a worked
            example.
          </p>
        </div>
      )}

      {loading && (
        <p className="text-[13.5px] text-[var(--ink-muted)]" role="status">
          Finding cases similar to {firId}…
        </p>
      )}

      {error && (
        <p
          className="rounded border border-[var(--risk-high)] bg-[var(--risk-high-soft)] px-3.5 py-3 text-[13.5px] text-[var(--risk-high)]"
          role="alert"
        >
          {error}
        </p>
      )}

      {notFound && !loading && (
        <div
          className="rounded border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-4"
          role="status"
        >
          <p className="text-[13.5px] font-semibold text-[var(--ink)]">
            No embedding for {firId}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-muted)]">
            This FIR is not in the embedded corpus. Check the id, or try a seeded one such as
            FIR-002683.
          </p>
        </div>
      )}

      {result && !loading && !error && !rejectedInput && <SimilarResult result={result} />}

      {!firId && !loading && !rejectedInput && (
        <p className="text-[13.5px] text-[var(--ink-faint)]">
          Enter a FIR id to find the closest past cases, or open one from a FIR in the Network view.
        </p>
      )}
    </div>
  );
}

function SimilarResult({ result }: { result: SimilarCases }) {
  const isEmpty = result.similarCases.length === 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-[13px] text-[var(--ink-muted)]">
        <span className="font-[family-name:var(--font-display)] text-[18px] text-[var(--ink)]">
          Cases similar to
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[12.5px]">{result.firId}</span>
        <span>
          {result.similarCases.length} match
          {result.similarCases.length === 1 ? "" : "es"} · top {result.limit}
        </span>
      </div>

      {isEmpty ? (
        <div
          className="rounded border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-5"
          role="status"
        >
          <p className="text-[13.5px] font-semibold text-[var(--ink)]">No similar cases</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-muted)]">
            {result.firId} is in the corpus but returned no neighbors. Nothing is inferred to fill
            the gap.
          </p>
        </div>
      ) : (
        <article className="card">
          <header className="border-b border-[var(--line)] px-5 pb-3 pt-4">
            <p className="section-label !mb-0">Ranked by similarity</p>
          </header>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
                  <th className="px-5 py-2.5 font-semibold">FIR</th>
                  <th className="px-5 py-2.5 font-semibold">Similarity</th>
                  <th className="px-5 py-2.5 font-semibold">Crime type</th>
                  <th className="px-5 py-2.5 font-semibold">District</th>
                  <th className="px-5 py-2.5 font-semibold">Filed</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.similarCases.map((c) => (
                  <tr key={c.firId} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-5 py-2.5 font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--ink)]">
                      {c.firId}
                    </td>
                    <td className="px-5 py-2.5">
                      <ScoreBar score={c.similarityScore} />
                    </td>
                    <td className="px-5 py-2.5 text-[var(--ink)]">{c.crimeType}</td>
                    <td className="px-5 py-2.5 text-[var(--ink-muted)]">{c.district}</td>
                    <td className="px-5 py-2.5 font-[family-name:var(--font-mono)] text-[12px] text-[var(--ink-muted)]">
                      {c.dateFiled ?? "—"}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--ink-muted)]">{formatStatus(c.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      <p className="mt-5 text-[12px] leading-relaxed text-[var(--ink-faint)]">
        Similarity is cosine distance over FIR narrative embeddings — a retrieval aid, not a verdict
        on whether cases are connected. High scores across districts often mean a shared modus
        operandi, which an investigator should confirm from the case records.
      </p>
    </>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(Math.min(Math.max(score, 0), 1) * 100);
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--surface-2)]"
      >
        <span
          className="block h-full rounded-full bg-[var(--accent)]"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--ink)]">
        {score.toFixed(3)}
      </span>
    </span>
  );
}

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
