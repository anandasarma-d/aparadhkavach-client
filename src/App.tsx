import { useState, type ReactNode } from "react";
import { HotspotPage } from "./HotspotPage";
import { NetworkPage } from "./NetworkPage";
import { RiskLookupPage } from "./RiskLookupPage";
import { SimilarCasesPage } from "./SimilarCasesPage";
import {
  DEFAULT_ROLE,
  DEMO_ROLES,
  ROLE_HOME,
  ROLE_LABELS,
  VIEW_LABELS,
  canSee,
  visibleViews,
  type AppView,
  type DemoRole,
} from "./rbac/demoRoleMatrix";

/**
 * Minimal F1 ↔ F2 ↔ K2 ↔ similar-cases switch — not a full dashboard shell (A6/A10/A12).
 * Demo RBAC stub (Auto/21 Approach A): a role switcher gates which tabs / cross-links
 * are visible. Capability gating only — not auth, not data-row scoping.
 */
export function App() {
  const [role, setRole] = useState<DemoRole>(DEFAULT_ROLE);
  const [view, setView] = useState<AppView>(ROLE_HOME[DEFAULT_ROLE]);
  const [networkEntityId, setNetworkEntityId] = useState<string | null>(null);
  const [similarFirId, setSimilarFirId] = useState<string | null>(null);

  const tabs = visibleViews(role);

  function changeRole(next: DemoRole) {
    setRole(next);
    setView(ROLE_HOME[next]);
  }

  function showNetworkFor(accusedId: string) {
    setNetworkEntityId(accusedId);
    setView("network");
  }

  function showSimilarFor(firId: string) {
    setSimilarFirId(firId);
    setView("similar");
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface-2)] px-7 py-2 text-xs text-[var(--ink-muted)]">
        <span className="flex items-center gap-3 font-[family-name:var(--font-mono)] text-sm tracking-wide">
          <img
            src="/aparadhkavach-logo.png"
            alt="AparadhKavach logo"
            className="h-10 w-10 shrink-0"
          />
          AparadhKavach · MVP-1
        </span>
        <nav className="flex items-center gap-1" aria-label="Primary">
          {tabs.map((v) => (
            <NavButton key={v} active={view === v} onClick={() => setView(v)}>
              {VIEW_LABELS[v]}
            </NavButton>
          ))}
        </nav>
        <div className="flex flex-col items-end gap-0.5">
          <label className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-[var(--ink-muted)]">
            <span className="text-[var(--ink-faint)]">Signed in as</span>
            <select
              value={role}
              onChange={(e) => changeRole(e.target.value as DemoRole)}
              aria-label="Demo role"
              className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]"
            >
              {DEMO_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <span className="text-[10.5px] text-[var(--ink-faint)]">
            Demo RBAC stub — navigation by role; not Catalyst Auth / JWT yet
          </span>
        </div>
      </div>

      {view === "risk" && (
        <RiskLookupPage
          embedded
          onShowNetwork={canSee(role, "network") ? showNetworkFor : undefined}
        />
      )}
      {view === "hotspots" && <HotspotPage />}
      {view === "network" && (
        <NetworkPage
          initialEntityId={networkEntityId}
          onShowSimilar={canSee(role, "similar") ? showSimilarFor : undefined}
        />
      )}
      {view === "similar" && <SimilarCasesPage initialFirId={similarFirId} />}
    </div>
  );
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded px-3 py-1.5 font-medium text-[var(--accent-ink)] bg-[var(--accent-soft)]"
          : "rounded px-3 py-1.5 text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
      }
    >
      {children}
    </button>
  );
}
