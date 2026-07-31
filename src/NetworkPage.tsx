import { Suspense, lazy, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  EntityNotFoundError,
  MAX_DEPTH,
  MIN_DEPTH,
  fetchEntityNetwork,
  type EntityNetwork,
} from "./api/entityNetworkClient";
import { DEMO_ACCUSED } from "./lib/demoAccused";
import { entityTypeLabel, presentTypes, readD1Palette } from "./lib/networkPalette";

// vis-network is ~500 kB of the bundle — keep it out of the Risk lookup entry path.
const NetworkCanvas = lazy(() =>
  import("./NetworkCanvas").then((m) => ({ default: m.NetworkCanvas })),
);

type NetworkPageProps = {
  /** Entity to load on mount — set when arriving from Risk lookup. */
  initialEntityId?: string | null;
  /** Cross-link into Similar cases for a FIR node (A12). */
  onShowSimilar?: (firId: string) => void;
};

export function NetworkPage({ initialEntityId = null, onShowSimilar }: NetworkPageProps) {
  const [query, setQuery] = useState(initialEntityId ?? "");
  const [entityId, setEntityId] = useState<string | null>(initialEntityId);
  const [depth, setDepth] = useState(MIN_DEPTH);
  const [network, setNetwork] = useState<EntityNetwork | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (initialEntityId) {
      setQuery(initialEntityId);
      setEntityId(initialEntityId);
    }
  }, [initialEntityId]);

  useEffect(() => {
    if (!entityId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setNotFound(false);
    setSelectedId(null);

    fetchEntityNetwork(entityId, depth, controller.signal)
      .then((data) => {
        setNetwork(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setNetwork(null);
        setLoading(false);
        if (err instanceof EntityNotFoundError) {
          setNotFound(true);
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => controller.abort();
  }, [entityId, depth]);

  function runLookup() {
    const raw = query.trim();
    if (raw) setEntityId(raw);
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
          Entity relationship view
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-muted)]">
          Direct links recorded in the case graph — who appears in which FIR, and the locations,
          vehicles and phones attached to those records. This is a view of{" "}
          <strong className="font-semibold text-[var(--ink)]">stored relationships</strong>, not a
          detection of gangs or organised crime groups.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        <div className="min-w-[240px] flex-1">
          <label className="sr-only" htmlFor="entity-search">
            Entity id (ACC-, FIR-, LOC-, VEH-, PHN-)
          </label>
          <input
            id="entity-search"
            value={query}
            list="network-demo-ids"
            placeholder="Entity id — e.g. ACC-00124 or FIR-001018"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-full rounded border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-[11px] text-[14.5px] text-[var(--ink)] shadow-[var(--shadow)] outline-none placeholder:text-[var(--ink-faint)]"
          />
          <datalist id="network-demo-ids">
            {DEMO_ACCUSED.map((a) => (
              <option key={a.accusedId} value={a.accusedId}>
                {a.name}
              </option>
            ))}
          </datalist>
        </div>

        <fieldset className="flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5">
          <legend className="sr-only">Traversal depth</legend>
          <span className="px-1 text-[12px] text-[var(--ink-muted)]">Depth</span>
          {[MIN_DEPTH, MAX_DEPTH].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={depth === d}
              onClick={() => setDepth(d)}
              className={
                depth === d
                  ? "rounded bg-[var(--accent-soft)] px-2.5 py-1 text-[13px] font-semibold text-[var(--accent-ink)]"
                  : "rounded px-2.5 py-1 text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }
            >
              {d}
            </button>
          ))}
        </fieldset>

        <button
          type="button"
          onClick={runLookup}
          className="rounded border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2.5 text-[13px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Show network
        </button>
      </div>

      {loading && (
        <p className="text-[13.5px] text-[var(--ink-muted)]" role="status">
          Loading network for {entityId}…
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
            No entity {entityId} in the case graph
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-muted)]">
            Nothing is inferred for unknown ids. Check the id, or try a seeded one such as
            ACC-00124.
          </p>
        </div>
      )}

      {network && !loading && !error && (
        <NetworkResult
          network={network}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onShowSimilar={onShowSimilar}
        />
      )}

      {!entityId && !loading && (
        <p className="text-[13.5px] text-[var(--ink-faint)]">
          Enter an entity id to load its recorded links, or open a network from Risk lookup.
        </p>
      )}
    </div>
  );
}

function isFirNode(type: string): boolean {
  return type.toUpperCase() === "FIR";
}

function NetworkResult({
  network,
  selectedId,
  onSelect,
  onShowSimilar,
}: {
  network: EntityNetwork;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onShowSimilar?: (firId: string) => void;
}) {
  const isEmpty = network.edges.length === 0;
  const types = useMemo(() => presentTypes(network.nodes), [network.nodes]);
  const nodeById = useMemo(
    () => new Map(network.nodes.map((n) => [n.id, n])),
    [network.nodes],
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-[13px] text-[var(--ink-muted)]">
        <span className="font-[family-name:var(--font-display)] text-[18px] text-[var(--ink)]">
          {network.entityLabel}
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[12.5px]">
          {network.entityId}
        </span>
        <span>
          {network.nodes.length} entit{network.nodes.length === 1 ? "y" : "ies"} ·{" "}
          {network.edges.length} link{network.edges.length === 1 ? "" : "s"} · depth{" "}
          {network.depth}
        </span>
      </div>

      {network.truncated && (
        <p
          className="mb-4 rounded border border-[var(--risk-moderate)] bg-[var(--risk-moderate-soft)] px-3.5 py-2.5 text-[12.5px] text-[var(--risk-moderate)]"
          role="status"
        >
          Neighborhood capped at {network.nodes.length} entities — some links are not shown.
        </p>
      )}

      {isEmpty ? (
        <div
          className="rounded border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-5"
          role="status"
        >
          <p className="text-[13.5px] font-semibold text-[var(--ink)]">No recorded links</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-muted)]">
            {network.entityId} exists in the case graph but has no relationships at depth{" "}
            {network.depth}. Try depth 2, or another entity — nothing is inferred to fill the gap.
          </p>
        </div>
      ) : (
        <>
          <Legend types={types} />
          <Suspense
            fallback={
              <div
                className="flex h-[420px] w-full items-center justify-center rounded border border-[var(--line)] bg-[var(--surface)] text-[13px] text-[var(--ink-muted)]"
                role="status"
              >
                Loading graph view…
              </div>
            }
          >
            <NetworkCanvas network={network} selectedId={selectedId} onSelect={onSelect} />
          </Suspense>
          <p className="mt-2 text-[11.5px] text-[var(--ink-faint)]">
            Drag to rearrange, scroll to zoom, click a node to highlight its row below. The table
            is the full, accessible equivalent of this canvas.
          </p>
        </>
      )}

      <div className="mt-7 grid grid-cols-1 gap-[22px] lg:grid-cols-2">
        <article className="card">
          <header className="border-b border-[var(--line)] px-5 pb-3 pt-4">
            <p className="section-label !mb-0">Entities ({network.nodes.length})</p>
          </header>
          <div className="max-h-80 overflow-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
                  <th className="px-5 py-2.5 font-semibold">Id</th>
                  <th className="px-5 py-2.5 font-semibold">Type</th>
                  <th className="px-5 py-2.5 font-semibold">Label</th>
                  {onShowSimilar && <th className="px-5 py-2.5 font-semibold" />}
                </tr>
              </thead>
              <tbody>
                {network.nodes.map((node) => (
                  <tr
                    key={node.id}
                    onClick={() => onSelect(node.id === selectedId ? null : node.id)}
                    className={`cursor-pointer border-b border-[var(--line)] last:border-0 ${
                      node.id === selectedId
                        ? "bg-[var(--accent-soft)]"
                        : "hover:bg-[var(--accent-soft)]/40"
                    }`}
                  >
                    <td className="px-5 py-2.5 font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--ink)]">
                      {node.id}
                      {node.id === network.entityId && (
                        <span className="ml-2 text-[10.5px] uppercase tracking-wide text-[var(--ink-faint)]">
                          start
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--ink-muted)]">
                      {entityTypeLabel(node.type)}
                    </td>
                    <td className="px-5 py-2.5 text-[var(--ink)]">{node.label}</td>
                    {onShowSimilar && (
                      <td className="px-5 py-2.5 text-right">
                        {isFirNode(node.type) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onShowSimilar(node.id);
                            }}
                            className="rounded px-2 py-1 text-[12px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                          >
                            Find similar →
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <header className="border-b border-[var(--line)] px-5 pb-3 pt-4">
            <p className="section-label !mb-0">Links ({network.edges.length})</p>
          </header>
          <div className="max-h-80 overflow-auto">
            {network.edges.length === 0 ? (
              <p className="px-5 py-4 text-[12.5px] text-[var(--ink-muted)]">
                No links at this depth.
              </p>
            ) : (
              <table className="w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
                    <th className="px-5 py-2.5 font-semibold">From</th>
                    <th className="px-5 py-2.5 font-semibold">Relationship</th>
                    <th className="px-5 py-2.5 font-semibold">To</th>
                  </tr>
                </thead>
                <tbody>
                  {network.edges.map((edge, index) => {
                    const active =
                      selectedId != null && (edge.from === selectedId || edge.to === selectedId);
                    return (
                      <tr
                        key={`${edge.from}|${edge.type}|${edge.to}|${index}`}
                        className={`border-b border-[var(--line)] last:border-0 ${
                          active ? "bg-[var(--accent-soft)]" : ""
                        }`}
                      >
                        <td className="px-5 py-2.5 font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--ink)]">
                          {nodeById.get(edge.from)?.label ?? edge.from}
                        </td>
                        <td className="px-5 py-2.5 font-[family-name:var(--font-mono)] text-[11.5px] text-[var(--accent-ink)]">
                          {edge.type}
                        </td>
                        <td className="px-5 py-2.5 font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--ink)]">
                          {nodeById.get(edge.to)?.label ?? edge.to}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </article>
      </div>

      <p className="mt-5 text-[12px] leading-relaxed text-[var(--ink-faint)]">
        Links come from the case graph as recorded. Absence of a link means nothing was recorded —
        not that no relationship exists. No community, gang, or organised-crime-group inference is
        performed.
      </p>
    </>
  );
}

function Legend({ types }: { types: string[] }) {
  const [colors, setColors] = useState<Record<string, string>>({});

  useEffect(() => {
    const palette = readD1Palette(document.documentElement);
    const next: Record<string, string> = {};
    for (const type of types) next[type] = palette.color(type);
    setColors(next);
  }, [types]);

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[var(--ink-muted)]">
      {types.map((type) => (
        <span key={type} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full border"
            style={{ backgroundColor: colors[type], borderColor: colors[type] }}
          />
          {entityTypeLabel(type)}
        </span>
      ))}
    </div>
  );
}
