import { useMemo, useState, type FormEvent } from "react";
import { askQuery, type QueryResult, type RelatedEntity } from "./api/queryClient";
import { DEMO_ACCUSED } from "./lib/demoAccused";
import { DEMO_FIRS } from "./lib/demoFirs";

type SeedMode = "accused" | "fir";

const ACCUSED_ID_PATTERN = /^ACC-[A-Za-z0-9_-]+$/i;
const FIR_ID_PATTERN = /^FIR-[A-Za-z0-9_-]+$/i;

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

    const mismatch = validateSeedForMode(mode, seed);
    if (mismatch) {
      setError(mismatch);
      setResult(null);
      return;
    }

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
    setResult(null);
  }

  function pickFir(id: string) {
    setMode("fir");
    setQuery(id);
    setError(null);
    setResult(null);
  }

  function selectMode(next: SeedMode) {
    setMode(next);
    setError(null);
    setResult(null);
    // Keep typed value, but warn if it clearly belongs to the other tab.
    const seed = query.trim();
    if (seed) {
      const mismatch = validateSeedForMode(next, seed);
      if (mismatch) setError(mismatch);
    }
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
          <ModeChip active={mode === "accused"} onClick={() => selectMode("accused")}>
            Accused
          </ModeChip>
          <ModeChip active={mode === "fir"} onClick={() => selectMode("fir")}>
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

/** Returns an officer-facing error, or null when the id matches the selected tab. */
export function validateSeedForMode(mode: SeedMode, seed: string): string | null {
  const id = seed.trim();
  if (!id) return "Enter an id to ask.";

  if (mode === "accused") {
    if (FIR_ID_PATTERN.test(id)) {
      return `“${id}” is an FIR id. Switch to the FIR tab, or enter an accused id (ACC-…).`;
    }
    if (!ACCUSED_ID_PATTERN.test(id)) {
      return `Accused id must look like ACC-00040 (got “${id}”).`;
    }
    return null;
  }

  if (ACCUSED_ID_PATTERN.test(id)) {
    return `“${id}” is an accused id. Switch to the Accused tab, or enter an FIR id (FIR-…).`;
  }
  if (!FIR_ID_PATTERN.test(id)) {
    return `FIR id must look like FIR-003276 (got “${id}”).`;
  }
  return null;
}

function QueryAnswerCard({ result }: { result: QueryResult }) {
  const softFail =
    result.confidenceScore === 0 &&
    /unusable structured response|not configured|timed out|call failed|interrupted/i.test(
      result.answer,
    );
  const briefingParas = useMemo(() => toParagraphs(result.answer), [result.answer]);
  const reasoningParas = useMemo(
    () => toParagraphs(humanizeOfficerProse(result.reasoningSummary)),
    [result.reasoningSummary],
  );
  const entityGroups = useMemo(
    () => groupRelatedEntities(result.relatedEntities),
    [result.relatedEntities],
  );

  return (
    <div className="space-y-5">
      <article className="card overflow-hidden">
        <SectionBand title="Case briefing" tone="primary" />
        <div className="space-y-3 px-5 py-4">
          <div className="space-y-3">
            {briefingParas.map((para, i) => (
              <p
                key={i}
                className="text-[14.5px] leading-relaxed text-[var(--ink)]"
              >
                {humanizeOfficerProse(para)}
              </p>
            ))}
          </div>
          {!softFail && reasoningParas.length > 0 && (
            <div className="space-y-2 border-t border-[var(--line)] pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                Why this reading
              </p>
              {reasoningParas.map((para, i) => (
                <p key={i} className="text-[13px] leading-relaxed text-[var(--ink-muted)]">
                  {para}
                </p>
              ))}
            </div>
          )}
          <QueryMetaBand result={result} softFail={softFail} />
        </div>
      </article>

      {result.evidenceSources.length > 0 && (
        <section>
          <SectionBand title="Evidence sources" tone="evidence" />
          <p className="mb-2 mt-2 text-[12px] text-[var(--ink-faint)]">
            Queried id and other cited ids not already listed under Related FIRs / people &amp;
            places.
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
        </section>
      )}

      {result.relatedFirs.length > 0 && (
        <section>
          <SectionBand title="Related FIRs" tone="firs" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.relatedFirs.map((id) => (
              <span
                key={id}
                className="rounded border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[12px] text-[var(--ink-muted)]"
              >
                {id}
              </span>
            ))}
          </div>
        </section>
      )}

      {entityGroups.length > 0 && (
        <section>
          <SectionBand title="Related people & places" tone="entities" />
          <div className="mt-3 space-y-4">
            {entityGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-1.5 text-[12px] font-semibold text-[var(--accent-ink)]">
                  {group.title}
                </p>
                <ul className="space-y-1.5 text-[13px]">
                  {group.items.map((e) => (
                    <li key={e.id} className="text-[var(--ink-muted)]">
                      <span className="font-[family-name:var(--font-mono)] text-[var(--ink)]">
                        {e.id}
                      </span>
                      {e.label ? ` · ${humanizeLabel(e.label)}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type BandTone = "primary" | "evidence" | "firs" | "entities";

function SectionBand({ title, tone }: { title: string; tone: BandTone }) {
  const barClass =
    tone === "primary"
      ? "border-l-[var(--accent)]"
      : tone === "evidence"
        ? "border-l-[#9a7340]"
        : tone === "firs"
          ? "border-l-[#3d5a80]"
          : "border-l-[#4a6741]";

  return (
    <div
      className={`rounded-md border border-[var(--line)] border-l-4 bg-[var(--surface-2)] px-3.5 py-2 ${barClass}`}
      role="heading"
      aria-level={2}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-ink)]">
        {title}
      </p>
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

/** Split model text into readable paragraphs (blank lines, else ~2 sentences each). */
export function toParagraphs(text: string): string[] {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return [];
  const byBlank = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  if (byBlank.length > 1) return byBlank;

  const single = byBlank[0] ?? trimmed;
  const sentences = single.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  if (!sentences || sentences.length <= 2) return [single];

  const groups: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    groups.push(
      sentences
        .slice(i, i + 2)
        .map((s) => s.trim())
        .join(" "),
    );
  }
  return groups;
}

/** Turn SCREAMING_SNAKE / InvestigationOfficer into officer-friendly wording. */
export function humanizeLabel(raw: string): string {
  if (!raw) return raw;
  return raw
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token)) return token;
      if (token.includes("_") || /^[A-Z]{2,}[A-Z0-9_]*$/.test(token)) {
        return token
          .split("_")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ");
      }
      if (/^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(token)) {
        return token.replace(/([a-z])([A-Z])/g, "$1 $2");
      }
      return token;
    })
    .join("");
}

/** Soften stack jargon the model sometimes echoes into officer-facing prose. */
export function humanizeOfficerProse(raw: string): string {
  if (!raw) return raw;
  return raw
    .replace(/\bCONTEXT graph\b/gi, "linked case records")
    .replace(/\bCONTEXT block\b/gi, "linked case records")
    .replace(/\bCONTEXT\b/g, "linked case records")
    .replace(/\b1-hop(?:\s+graph)?\s+neighborhood\b/gi, "immediate linked records")
    .replace(/\bneo4j\b/gi, "graph records")
    .replace(/\bMARKET_AREA\b/g, "market area")
    .replace(/\bATM_VICINITY\b/g, "ATM vicinity")
    .replace(/\b([A-Z]{2,}(?:_[A-Z0-9]+)+)\b/g, (_, code: string) => humanizeLabel(code));
}

type EntityGroup = { title: string; items: RelatedEntity[] };

const ENTITY_GROUP_ORDER: { title: string; match: (type: string, id: string) => boolean }[] = [
  {
    title: "Accused",
    match: (t, id) => /^accused$/i.test(t) || id.toUpperCase().startsWith("ACC-"),
  },
  {
    title: "Victims",
    match: (t, id) => /^victim/i.test(t) || id.toUpperCase().startsWith("VIC-"),
  },
  {
    title: "Witnesses",
    match: (t, id) => /^witness/i.test(t) || id.toUpperCase().startsWith("WIT-"),
  },
  {
    title: "Locations",
    match: (t, id) => /^location/i.test(t) || id.toUpperCase().startsWith("LOC-"),
  },
  {
    title: "Investigation officers",
    match: (t, id) =>
      /officer|investigation/i.test(t) || id.toUpperCase().startsWith("OFF-"),
  },
  {
    title: "FIRs",
    match: (t, id) => /^fir$/i.test(t) || id.toUpperCase().startsWith("FIR-"),
  },
];

export function groupRelatedEntities(entities: RelatedEntity[]): EntityGroup[] {
  const remaining = [...entities];
  const groups: EntityGroup[] = [];

  for (const def of ENTITY_GROUP_ORDER) {
    const items: RelatedEntity[] = [];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const e = remaining[i];
      if (def.match(e.type ?? "", e.id)) {
        items.unshift(e);
        remaining.splice(i, 1);
      }
    }
    if (items.length > 0) {
      groups.push({ title: def.title, items });
    }
  }

  if (remaining.length > 0) {
    groups.push({ title: "Other", items: remaining });
  }
  return groups;
}
