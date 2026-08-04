import { useState, type FormEvent } from "react";
import { askQuery, type QueryResult } from "./api/queryClient";
import { DEMO_ACCUSED } from "./lib/demoAccused";
import { DEMO_FIRS } from "./lib/demoFirs";

type SeedMode = "accused" | "fir";

/**
 * Single-shot citation Q&A (mvp2/11). Honesty label: v1 slice of the Graph-RAC pipeline.
 */
export function QaPage() {
  const [mode, setMode] = useState<SeedMode>("accused");
  const [query, setQuery] = useState(DEMO_ACCUSED[5]?.accusedId ?? "ACC-00040");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const seed = query.trim();
    if (!seed) return;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data =
        mode === "accused"
          ? await askQuery({ accusedId: seed, firId: null })
          : await askQuery({ accusedId: null, firId: seed });
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function pickAccused(id: string) {
    setMode("accused");
    setQuery(id);
    setError(null);
  }

  function pickFir(id: string) {
    setMode("fir");
    setQuery(id);
    setError(null);
  }

  return (
    <div className="mx-auto max-w-3xl px-7 py-8">
      <header className="mb-6">
        <p className="section-label">Investigator assist</p>
        <h1 className="font-[family-name:var(--font-display)] text-[28px] tracking-tight text-[var(--ink)]">
          Q&amp;A with citations
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--ink-muted)]">
          Enter one accused id or FIR. The system assembles investigation context and a 1-hop graph
          neighborhood, then asks the model once.
        </p>
        <p className="mt-2 text-[12.5px] font-medium text-[var(--accent-ink)]">
          v1 slice of the Graph-RAC pipeline — not multi-turn, not voice, not vector search on this
          path.
        </p>
      </header>

      <form onSubmit={onSubmit} className="mb-5 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Seed type">
          <ModeChip active={mode === "accused"} onClick={() => setMode("accused")}>
            Accused
          </ModeChip>
          <ModeChip active={mode === "fir"} onClick={() => setMode("fir")}>
            FIR
          </ModeChip>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === "accused" ? "ACC-00040" : "FIR-003276"}
            className="min-w-[16rem] flex-1 rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-[family-name:var(--font-mono)] text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            aria-label={mode === "accused" ? "Accused id" : "FIR id"}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="rounded bg-[var(--accent)] px-4 py-2 font-[family-name:var(--font-mono)] text-[12.5px] font-medium text-white disabled:opacity-50"
          >
            {loading ? "Asking…" : "Ask"}
          </button>
        </div>
      </form>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {(mode === "accused" ? DEMO_ACCUSED : DEMO_FIRS).map((item) => {
          const id = "accusedId" in item ? item.accusedId : item.firId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => ("accusedId" in item ? pickAccused(id) : pickFir(id))}
              className={`rounded-full border px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11.5px] transition-colors ${
                query === id
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                  : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
              }`}
            >
              {id}
            </button>
          );
        })}
      </div>

      {error && (
        <p
          className="mb-4 rounded border border-[var(--risk-high)] bg-[var(--risk-high-soft)] px-3.5 py-3 text-[13.5px] text-[var(--risk-high)]"
          role="alert"
        >
          {error}
        </p>
      )}

      {loading && (
        <p className="text-[13.5px] text-[var(--ink-muted)]" role="status">
          Assembling context and calling the model…
        </p>
      )}

      {result && !loading && <QueryAnswerCard result={result} />}

      {!result && !loading && !error && (
        <p className="text-[13.5px] text-[var(--ink-faint)]">
          Try ACC-00040 or FIR-003276 for a rehearsed Lane B demo seed.
        </p>
      )}
    </div>
  );
}

function ModeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-[var(--accent-soft)] px-3 py-1.5 font-[family-name:var(--font-mono)] text-[12px] font-medium text-[var(--accent-ink)]"
          : "rounded-md px-3 py-1.5 font-[family-name:var(--font-mono)] text-[12px] text-[var(--ink-muted)] hover:bg-[var(--surface)]"
      }
    >
      {children}
    </button>
  );
}

function QueryAnswerCard({ result }: { result: QueryResult }) {
  const softFail =
    result.confidenceScore === 0 &&
    /unusable structured response|not configured|timed out|call failed|interrupted/i.test(
      result.answer,
    );

  return (
    <div className="space-y-4">
      <article className="card">
        <header className="border-b border-[var(--line)] px-5 pb-3 pt-4">
          <p className="section-label !mb-0">Answer</p>
        </header>
        <div className="space-y-3 px-5 py-4">
          <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-[var(--ink)]">
            {result.answer}
          </p>
          {!softFail && (
            <p className="text-[13px] leading-relaxed text-[var(--ink-muted)]">
              {result.reasoningSummary}
            </p>
          )}
          <QueryMetaBand result={result} softFail={softFail} />
        </div>
      </article>

      {result.evidenceSources.length > 0 && (
        <div>
          <p className="section-label">Evidence sources</p>
          <p className="mb-2 text-[12px] text-[var(--ink-faint)]">
            Seed and other cited ids not listed under Related FIRs / entities.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.evidenceSources.map((id) => (
              <span
                key={id}
                className="rounded border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[12px] text-[var(--ink)]"
              >
                {id}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.relatedFirs.length > 0 && (
        <div>
          <p className="section-label">Related FIRs</p>
          <div className="flex flex-wrap gap-1.5">
            {result.relatedFirs.map((id) => (
              <span
                key={id}
                className="rounded border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[12px] text-[var(--ink-muted)]"
              >
                {id}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.relatedEntities.length > 0 && (
        <div>
          <p className="section-label">Related entities</p>
          <ul className="space-y-1.5 text-[13px]">
            {result.relatedEntities.map((e) => (
              <li key={e.id} className="text-[var(--ink-muted)]">
                <span className="font-[family-name:var(--font-mono)] text-[var(--ink)]">{e.id}</span>
                {e.type ? ` · ${e.type}` : ""}
                {e.label ? ` · ${e.label}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function QueryMetaBand({ result, softFail }: { result: QueryResult; softFail: boolean }) {
  const latencySec = (result.latencyMs / 1000).toFixed(1);
  const confidencePct = Math.round(result.confidenceScore * 100);

  return (
    <div
      className="mt-1 flex flex-wrap gap-2 rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2.5"
      aria-label="Response metadata"
    >
      <MetaChip label="Confidence" value={softFail ? "—" : `${confidencePct}%`} emphasize />
      <MetaChip label="Time" value={`${latencySec}s`} />
      <MetaChip label="Session" value={result.conversationId} mono />
    </div>
  );
}

function MetaChip({
  label,
  value,
  emphasize = false,
  mono = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="min-w-[7rem] flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-ink)]">
        {label}
      </p>
      <p
        className={`mt-0.5 text-[13px] font-semibold text-[var(--ink)] ${
          mono ? "font-[family-name:var(--font-mono)] text-[12px]" : ""
        } ${emphasize ? "text-[15px] text-[var(--accent-ink)]" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
