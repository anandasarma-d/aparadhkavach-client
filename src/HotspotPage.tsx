import { useEffect, useMemo, useState } from "react";
import { fetchHotspots, type HotspotRow } from "./api/hotspotsClient";
import { districtDisplayName } from "./lib/districtNames";

type SortKey = "district" | "crimeType" | "forecastWindow" | "hotspotScore";

function scoreBand(score: number): "low" | "moderate" | "high" {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "moderate";
  return "low";
}

export function HotspotPage() {
  const [rows, setRows] = useState<HotspotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("hotspotScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchHotspots(200, undefined, controller.signal)
      .then((page) => {
        setRows(page.hotspots ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const sorted = useMemo(() => {
    const copy = [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      switch (sortKey) {
        case "district":
          return (
            dir *
            districtDisplayName(a.districtId).localeCompare(
              districtDisplayName(b.districtId),
            )
          );
        case "crimeType":
          return dir * a.crimeType.localeCompare(b.crimeType);
        case "forecastWindow":
          return dir * a.forecastWindow.localeCompare(b.forecastWindow);
        case "hotspotScore":
        default:
          return dir * (a.hotspotScore - b.hotspotScore);
      }
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "hotspotScore" ? "desc" : "asc");
    }
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <div className="text-[var(--ink)]">
      <div className="flex flex-nowrap items-center gap-5 overflow-x-auto border-b border-[var(--line)] bg-[var(--paper)] px-7 py-3 text-[12.5px] text-[var(--ink-muted)] whitespace-nowrap">
        <span>
          <strong className="font-semibold text-[var(--ink)]">Forecast scores —</strong>{" "}
          every value is a model output:
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="chip-model">MODEL ESTIMATE</span>
          <span>QuickML hotspot forecast via Catalyst DataStore</span>
        </span>
      </div>

      <div className="mx-auto max-w-6xl px-7 py-8">
      <header className="mb-8 max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
          Feature 2 — C3/C4
        </p>
        <h1
          className="mt-2 font-[family-name:var(--font-display)] text-[2rem] leading-tight text-[var(--ink)]"
          style={{ fontWeight: 400 }}
        >
          Crime hotspot view
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-muted)]">
          District × crime type ranked by per-district normalized{" "}
          <span className="font-[family-name:var(--font-mono)] text-[var(--ink)]">
            hotspot_score
          </span>{" "}
          (0–1). Sortable table — not a map. Scores from DataStore{" "}
          <span className="font-[family-name:var(--font-mono)]">hotspot_forecasts</span> via
          Gateway.
        </p>
      </header>

      {loading && (
        <p className="text-sm text-[var(--ink-muted)]">Loading hotspot forecasts…</p>
      )}
      {error && (
        <div
          className="mb-6 rounded border border-[var(--risk-high)]/30 bg-[var(--risk-high-soft)] px-4 py-3 text-sm text-[var(--risk-high)]"
          role="alert"
        >
          {error}
        </div>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-[var(--ink-muted)]">
          No hotspot rows yet — import <code>hotspot_forecasts</code> (seed or QuickML), then
          redeploy Analytics if needed.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="rounded border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="max-h-[min(28rem,calc(100vh-14rem))] overflow-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
                  <th className="px-4 py-3 font-semibold">
                    <button type="button" className="hover:text-[var(--ink)]" onClick={() => toggleSort("district")}>
                      District{sortMark("district")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button type="button" className="hover:text-[var(--ink)]" onClick={() => toggleSort("crimeType")}>
                      Crime type{sortMark("crimeType")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button
                      type="button"
                      className="hover:text-[var(--ink)]"
                      onClick={() => toggleSort("forecastWindow")}
                    >
                      Window{sortMark("forecastWindow")}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button
                      type="button"
                      className="hover:text-[var(--ink)]"
                      onClick={() => toggleSort("hotspotScore")}
                    >
                      Score{sortMark("hotspotScore")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const band = scoreBand(row.hotspotScore);
                  const bandColor =
                    band === "high"
                      ? "text-[var(--risk-high)]"
                      : band === "moderate"
                        ? "text-[var(--risk-moderate)]"
                        : "text-[var(--risk-low)]";
                  return (
                    <tr
                      key={row.forecastId}
                      className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--accent-soft)]/40"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--ink)]">
                        {districtDisplayName(row.districtId)}
                      </td>
                      <td className="px-4 py-3 text-[var(--ink-muted)]">{row.crimeType}</td>
                      <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-[var(--ink-muted)]">
                        {row.forecastWindow}
                      </td>
                      <td
                        className={`px-4 py-3 font-[family-name:var(--font-mono)] font-semibold tabular-nums ${bandColor}`}
                      >
                        {row.hotspotScore.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[var(--line)] px-4 py-2.5 text-[11px] text-[var(--ink-faint)]">
            {rows.length} forecast{rows.length === 1 ? "" : "s"} · score ≥ 0.70 ≈ alert threshold
            · pipeline from first row:{" "}
            <span className="font-[family-name:var(--font-mono)]">{rows[0]?.pipelineRunId}</span>
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
