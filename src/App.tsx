import { useState, type ReactNode } from "react";
import { HotspotPage } from "./HotspotPage";
import { RiskLookupPage } from "./RiskLookupPage";

type AppView = "risk" | "hotspots";

/**
 * Minimal F1 ↔ F2 switch — not a full dashboard shell (A6).
 */
export function App() {
  const [view, setView] = useState<AppView>("risk");

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface-2)] px-7 py-2.5 text-xs text-[var(--ink-muted)]">
        <span className="font-[family-name:var(--font-mono)] tracking-wide">
          AparadhKavach · MVP-1
        </span>
        <nav className="flex items-center gap-1" aria-label="Primary">
          <NavButton active={view === "risk"} onClick={() => setView("risk")}>
            Risk lookup
          </NavButton>
          <NavButton active={view === "hotspots"} onClick={() => setView("hotspots")}>
            Hotspots
          </NavButton>
        </nav>
        <span className="font-[family-name:var(--font-mono)] text-[var(--ink-faint)]">
          Demo role: INVESTIGATOR
        </span>
      </div>

      {view === "risk" ? <RiskLookupPage embedded /> : <HotspotPage />}
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
