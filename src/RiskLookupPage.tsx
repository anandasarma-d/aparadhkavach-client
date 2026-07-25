import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { fetchAccusedRiskProfile } from "./api/apiGatewayClient";
import type { AccusedRiskProfile } from "./api/accusedRiskProfile";
import { DEMO_ACCUSED, filterAccusedOptions, type AccusedOption } from "./lib/demoAccused";
import {
  caseDriverRows,
  featureLabel,
  riskBand,
  riskBandLabel,
  topFeatures,
  TRAINING_TOP_DRIVERS,
  type RiskBand,
} from "./lib/riskFeatures";

const DIAL_CIRCUMFERENCE = 2 * Math.PI * 44;

type RiskLookupPageProps = {
  /** When true, App shell owns the top chrome — skip duplicate header. */
  embedded?: boolean;
  /** Jump to the K2 network view for this accused (A10). Omitted when rendered standalone. */
  onShowNetwork?: (accusedId: string) => void;
};

export function RiskLookupPage({ embedded = false, onShowNetwork }: RiskLookupPageProps) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<AccusedRiskProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const matches = filterAccusedOptions(query);
  const hint =
    query.trim().length > 0
      ? `${matches.length} match${matches.length === 1 ? "" : "es"} for "${query.trim()}"${
          selectedId ? ` · showing ${selectedId}` : ""
        }`
      : "Type a name or ACC- id, then select or press Enter";

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setProfile(null);

    fetchAccusedRiskProfile(selectedId, controller.signal)
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => controller.abort();
  }, [selectedId]);

  function selectOption(option: AccusedOption) {
    setQuery(option.name);
    setSelectedId(option.accusedId);
    setOpen(false);
  }

  function lookupRawId() {
    const raw = query.trim();
    if (!raw) return;
    const fromRoster = DEMO_ACCUSED.find(
      (a) =>
        a.accusedId.toLowerCase() === raw.toLowerCase() ||
        a.name.toLowerCase() === raw.toLowerCase(),
    );
    if (fromRoster) {
      selectOption(fromRoster);
      return;
    }
    setSelectedId(raw);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && matches[activeIndex]) selectOption(matches[activeIndex]);
      else lookupRawId();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={embedded ? "text-[var(--ink)]" : "min-h-screen bg-[var(--paper)] text-[var(--ink)]"}>
      {!embedded && (
        <div className="border-b border-[var(--line)] bg-[var(--surface-2)] px-7 py-2.5 text-xs text-[var(--ink-muted)]">
          <span className="font-[family-name:var(--font-mono)] tracking-wide">
            AparadhKavach · Repeat-Offender Risk Lookup
          </span>
        </div>
      )}

      <div className="flex flex-nowrap items-center gap-5 overflow-x-auto border-b border-[var(--line)] bg-[var(--paper)] px-7 py-3 text-[12.5px] text-[var(--ink-muted)] whitespace-nowrap">
        <span>
          <strong className="font-semibold text-[var(--ink)]">Evidence vs. inference —</strong>{" "}
          every value is marked by source:
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="chip-record">RECORD</span>
          <span>from the accused case record</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="chip-model">MODEL ESTIMATE</span>
          <span>computed by QuickML — always labelled as an estimate</span>
        </span>
      </div>

      <section className="mx-auto max-w-[1180px] px-7 pb-16 pt-9">
        <div className="mb-1.5 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.08em] text-[var(--ink-faint)]">
          Feature 1 — C2
        </div>
        <h1 className="mb-7 border-b border-[var(--line)] pb-[18px] font-[family-name:var(--font-display)] text-[26px] font-normal text-[var(--ink)] text-balance">
          Repeat-Offender Risk Lookup
          <small className="mt-1.5 block font-[family-name:var(--font-body)] text-[13px] font-normal text-[var(--ink-muted)]">
            Search an accused, review their case record, and see the model&apos;s risk score with
            its source and attribution availability clearly labelled.
          </small>
        </h1>

        <div className="mb-6 flex flex-wrap items-stretch gap-2.5" ref={rootRef}>
          <div className="relative min-w-[240px] flex-1">
            <label className="sr-only" htmlFor="accused-search">
              Search accused by name or id
            </label>
            <div className="flex items-center gap-2.5 rounded border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-[11px] shadow-[var(--shadow)]">
              <SearchIcon />
              <input
                id="accused-search"
                role="combobox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-autocomplete="list"
                autoComplete="off"
                value={query}
                placeholder="Search by name or ACC- id…"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  setActiveIndex(0);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKeyDown}
                className="w-full border-0 bg-transparent text-[14.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
              />
            </div>
            {open && matches.length > 0 && (
              <ul
                id={listboxId}
                role="listbox"
                className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]"
              >
                {matches.map((option, index) => (
                  <li key={option.accusedId} role="option" aria-selected={index === activeIndex}>
                    <button
                      type="button"
                      className={`flex w-full items-baseline justify-between gap-3 px-3.5 py-2.5 text-left text-[13.5px] ${
                        index === activeIndex ? "bg-[var(--surface-2)]" : ""
                      }`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectOption(option)}
                    >
                      <span className="font-[family-name:var(--font-display)] text-[15px]">
                        {option.name}
                      </span>
                      <span className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--ink-muted)]">
                        {option.accusedId}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={lookupRawId}
            className="rounded border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2.5 text-[13px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Look up
          </button>
          <div className="whitespace-nowrap px-1 py-[11px] text-xs text-[var(--ink-faint)]">
            {hint}
          </div>
        </div>

        {loading && (
          <p className="text-[13.5px] text-[var(--ink-muted)]" role="status">
            Loading risk profile…
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
        {profile && !loading && <Dossier profile={profile} onShowNetwork={onShowNetwork} />}
        {!profile && !loading && !error && (
          <p className="text-[13.5px] text-[var(--ink-faint)]">
            Select an accused to load their record and QuickML risk assessment.
          </p>
        )}
      </section>
    </div>
  );
}

function Dossier({
  profile,
  onShowNetwork,
}: {
  profile: AccusedRiskProfile;
  onShowNetwork?: (accusedId: string) => void;
}) {
  const score = Number(profile.riskScore);
  const band = riskBand(score);
  const factors = topFeatures(profile.topFeatureImportance, 3);
  const hasFeatureImportance = factors.length > 0;
  const maxAbs = Math.max(...factors.map((f) => Math.abs(f.weight)), 0.0001);
  const drivers = profile.caseDrivers;
  const hasDrivers = drivers != null;
  const driverRows = hasDrivers ? caseDriverRows(drivers) : [];

  return (
    <div className="grid grid-cols-1 gap-[22px] md:grid-cols-[1.55fr_1fr]">
      <article className="card">
        <header className="border-b border-[var(--line)] px-5 pb-3.5 pt-[18px]">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="font-[family-name:var(--font-display)] text-[21px]">
              {profile.name}
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--ink-muted)]">
              {profile.accusedId}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-[13px] text-[var(--ink-muted)]">
            <span>
              District id{" "}
              <b className="font-semibold text-[var(--ink)] font-[family-name:var(--font-mono)]">
                {profile.addressDistrictId}
              </b>
            </span>
            <span className="chip-record">RECORD</span>
          </div>
        </header>
        <div className="px-5 pb-5 pt-[18px]">
          <p className="section-label">Case facts</p>
          <table className="w-full border-collapse text-[13.5px]">
            <tbody>
              <FactRow label="Offenses on record" value={String(profile.priorOffenseCount)} />
              <FactRow label="Accused id" value={profile.accusedId} />
              <FactRow label="Address district id" value={profile.addressDistrictId} />
            </tbody>
          </table>
          <p className="mt-4 text-[12px] leading-relaxed text-[var(--ink-faint)]">
            Linked FIR history is not listed here — this panel shows the accused&apos;s stored
            record fields only. Model inputs for the score appear under Case drivers.
          </p>
          {onShowNetwork && (
            <button
              type="button"
              onClick={() => onShowNetwork(profile.accusedId)}
              className="mt-4 rounded border border-[var(--accent)] bg-[var(--accent-soft)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Show network →
            </button>
          )}
        </div>
      </article>

      <article className="card">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-5 pb-3.5 pt-[18px]">
          <p className="section-label !mb-0">Risk assessment</p>
          <span className="chip-model">MODEL ESTIMATE</span>
        </header>
        <div className="px-5 pb-5 pt-[18px]">
          <div className="flex items-center gap-[18px] pb-5 pt-1.5">
            <RiskDial score={score} band={band} />
            <p className="text-[13px] leading-relaxed text-[var(--ink-muted)]">
              Score is the QuickML repeat-offender estimate (0–100) for this accused.{" "}
              {hasFeatureImportance
                ? "Factors below are the top-3 contributions returned with the score."
                : hasDrivers
                  ? "The model inputs used for this accused are shown below; how much each moved this particular score was not returned."
                  : "How much each factor moved this particular score was not returned with the prediction."}
            </p>
          </div>

          {/* Dormant branch: renders only if QuickML ever returns real per-score importances. */}
          {hasFeatureImportance && (
            <>
              <p className="section-label">Top contributing factors</p>
              {factors.map((factor) => {
                const pct = Math.round((Math.abs(factor.weight) / maxAbs) * 100);
                const weightPct = `${(Math.abs(factor.weight) * 100).toFixed(0)}%`;
                return (
                  <div
                    key={factor.key}
                    className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-t border-[var(--line)] py-3"
                  >
                    <span className="text-[13.5px] text-[var(--ink)]">
                      {featureLabel(factor.key)}
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-[12.5px] tabular-nums text-[var(--accent-ink)]">
                      {weightPct}
                    </span>
                    <div className="col-span-2 h-1.5 overflow-hidden rounded-sm bg-[var(--surface-2)]">
                      <div
                        className="h-full rounded-sm bg-[var(--accent)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="col-span-2 mt-1 text-xs text-[var(--ink-muted)]">
                      <span className="chip-model mr-1.5 scale-[0.92] origin-left">
                        MODEL ESTIMATE
                      </span>
                      Feature key{" "}
                      <span className="font-[family-name:var(--font-mono)]">{factor.key}</span>
                      {" · "}
                      raw weight{" "}
                      <span className="font-[family-name:var(--font-mono)] tabular-nums">
                        {factor.weight.toFixed(3)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Primary MVP-1 path: real per-accused model inputs (A7 3-Full). */}
          {!hasFeatureImportance && hasDrivers && (
            <>
              <div className="mb-1 flex items-center justify-between">
                <p className="section-label !mb-0">Case drivers</p>
                <span className="chip-input">MODEL INPUT</span>
              </div>
              <p className="mb-1 text-[12px] leading-relaxed text-[var(--ink-muted)]">
                Values QuickML used as <strong>inputs</strong> for this accused, derived from their
                FIR and network history — not an explanation of how much each moved this score.
              </p>
              <table className="w-full border-collapse text-[13.5px]">
                <tbody>
                  {driverRows.map((row) => (
                    <tr key={row.key} className="border-t border-[var(--line)]">
                      <td className="w-[56%] py-2.5 pr-1 align-top text-[var(--ink-muted)]">
                        {row.label}
                        {row.note && (
                          <span className="mt-0.5 block text-[11px] text-[var(--ink-faint)]">
                            {row.note}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right align-top font-[family-name:var(--font-mono)] tabular-nums text-[var(--ink)]">
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div
                className="mt-3 rounded border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-3"
                role="status"
              >
                <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
                  <strong className="text-[var(--ink)]">
                    Why this score is not broken down by weight.
                  </strong>{" "}
                  The prediction did not say how much each driver moved <em>this</em> score, so no
                  weights are invented here. Across the trained model, the strongest overall drivers
                  are {TRAINING_TOP_DRIVERS.join(", ")} — that is model-wide ranking, not this
                  record&apos;s breakdown.
                </p>
              </div>
            </>
          )}

          {/* Fallback: no drivers and no importance (e.g. accused_features not yet imported). */}
          {!hasFeatureImportance && !hasDrivers && (
            <>
              <p className="section-label">Top contributing factors</p>
              <div
                className="rounded border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-3"
                role="status"
              >
                <p className="text-[13.5px] font-semibold text-[var(--ink)]">
                  Feature attribution unavailable
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
                  The prediction returned a score without a factor breakdown, and no model inputs
                  were available for this accused. No factor weights are invented here.
                </p>
              </div>
            </>
          )}

          <div className="mt-[18px] rounded border border-dashed border-[var(--accent)] bg-[var(--accent-soft)] px-3.5 py-3 text-xs leading-relaxed text-[var(--accent-ink)]">
            <span className="chip-model mr-1">MODEL ESTIMATE</span>
            Score id{" "}
            <span className="font-[family-name:var(--font-mono)]">{profile.scoreId}</span>
            {" · "}
            scored{" "}
            <span className="font-[family-name:var(--font-mono)]">
              {formatScoredAt(profile.scoredAt)}
            </span>
            {" · "}
            pipeline{" "}
            <span className="font-[family-name:var(--font-mono)]">{profile.pipelineRunId}</span>
            .{" "}
            {hasFeatureImportance
              ? "Feature weights are this record’s contribution to the score, not fixed rules."
              : "A factor-by-factor weight breakdown was not supplied with this score."}
          </div>
        </div>
      </article>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-[var(--line)] last:border-b-0">
      <td className="w-[56%] py-2.5 pr-1 text-[var(--ink-muted)]">{label}</td>
      <td className="py-2.5 text-right font-[family-name:var(--font-mono)] tabular-nums text-[var(--ink)]">
        {value}
      </td>
    </tr>
  );
}

function RiskDial({ score, band }: { score: number; band: RiskBand }) {
  const clamped = Math.min(100, Math.max(0, score));
  const offset = DIAL_CIRCUMFERENCE * (1 - clamped / 100);
  const color =
    band === "high"
      ? "var(--risk-high)"
      : band === "moderate"
        ? "var(--risk-moderate)"
        : "var(--risk-low)";

  return (
    <div className="relative h-[104px] w-[104px] shrink-0" aria-label={`Risk score ${clamped}`}>
      <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90">
        <circle
          cx="52"
          cy="52"
          r="44"
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth="10"
        />
        <circle
          cx="52"
          cy="52"
          r="44"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="butt"
          strokeDasharray={DIAL_CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center font-[family-name:var(--font-mono)] tabular-nums">
        <span className="text-[22px] font-semibold">{clamped.toFixed(0)}</span>
        <span className="mt-px text-[9.5px] uppercase tracking-[0.06em]" style={{ color }}>
          {riskBandLabel(band)}
        </span>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="shrink-0 text-[var(--ink-faint)]"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function formatScoredAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace(".000Z", "Z");
}
