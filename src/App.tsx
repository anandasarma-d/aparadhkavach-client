import { useState, type ReactNode } from "react";
import { revokeSession } from "./api/authClient";
import { catalystSignOut, clearSignOutAttempted, loggedOutUrl, markSignOutAttempted } from "./auth/catalyst";
import {
  clearLogoutPending,
  clearSession,
  loadSession,
  markLogoutPending,
  saveSession,
  type AuthSession,
} from "./auth/session";
import { HotspotPage } from "./HotspotPage";
import { LoginPage } from "./LoginPage";
import { NetworkPage } from "./NetworkPage";
import { RiskLookupPage } from "./RiskLookupPage";
import { SimilarCasesPage } from "./SimilarCasesPage";
import {
  ROLE_LABELS,
  VIEW_LABELS,
  canSee,
  homeView,
  visibleViews,
  type AppView,
} from "./rbac/roleMatrix";

/**
 * Lane B shell (mvp2/10): JWT session in sessionStorage; tabs from server views[].
 */
export function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [loggingOut, setLoggingOut] = useState(false);
  const [view, setView] = useState<AppView>(() => {
    const s = loadSession();
    return s ? homeView(s.views, s.homeView) : "risk";
  });
  const [networkEntityId, setNetworkEntityId] = useState<string | null>(null);
  const [similarFirId, setSimilarFirId] = useState<string | null>(null);

  function onSignedIn(next: AuthSession) {
    clearLogoutPending();
    clearSignOutAttempted();
    setLoggingOut(false);
    saveSession(next);
    setSession(next);
    setView(homeView(next.views, next.homeView));
    setNetworkEntityId(null);
    setSimilarFirId(null);
  }

  function logout() {
    const token = session?.accessToken;
    // Prevent LoginPage from auto-minting off a lingering Catalyst cookie.
    markLogoutPending();
    markSignOutAttempted();
    setLoggingOut(true);
    clearSession();
    setSession(null);
    setNetworkEntityId(null);
    setSimilarFirId(null);
    if (token) {
      void revokeSession(token);
    }
    // signOut → executor /accounts/logout → bounce to zohoportal (clears cookies) → serviceurl.
    void catalystSignOut(loggedOutUrl());
  }

  function showNetworkFor(accusedId: string) {
    setNetworkEntityId(accusedId);
    setView("network");
  }

  function showSimilarFor(firId: string) {
    setSimilarFirId(firId);
    setView("similar");
  }

  if (loggingOut) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--paper)] text-[var(--ink-muted)]">
        <p className="text-[14px]">Signing out…</p>
      </div>
    );
  }

  if (!session) {
    return <LoginPage onSignedIn={onSignedIn} />;
  }

  const tabs = visibleViews(session.views);
  const roleLabel = ROLE_LABELS[session.role] ?? session.displayName;

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface-2)] px-7 py-2 text-xs text-[var(--ink-muted)]">
        <span className="flex items-center gap-3 font-[family-name:var(--font-mono)] text-sm tracking-wide">
          <img
            src="/aparadhkavach-logo.png"
            alt="AparadhKavach logo"
            className="h-10 w-10 shrink-0"
          />
          AparadhKavach · Lane B
        </span>
        <nav className="flex items-center gap-1" aria-label="Primary">
          {tabs.map((v) => (
            <NavButton key={v} active={view === v} onClick={() => setView(v)}>
              {VIEW_LABELS[v]}
            </NavButton>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="font-[family-name:var(--font-mono)] text-[12.5px]">
            <span className="text-[var(--ink-faint)]">Signed in as</span>{" "}
            <span className="font-medium text-[var(--accent-ink)]">{roleLabel}</span>
          </span>
          <button
            type="button"
            onClick={logout}
            className="rounded border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[12px] text-[var(--ink-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Logout
          </button>
        </div>
      </div>

      {view === "risk" && (
        <RiskLookupPage
          embedded
          onShowNetwork={
            canSee(session.views, "network") ? showNetworkFor : undefined
          }
        />
      )}
      {view === "hotspots" && <HotspotPage />}
      {view === "network" && (
        <NetworkPage
          initialEntityId={networkEntityId}
          onShowSimilar={
            canSee(session.views, "similar") ? showSimilarFor : undefined
          }
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
          ? "rounded-md bg-[var(--accent-soft)] px-3 py-1.5 font-[family-name:var(--font-mono)] text-[12.5px] font-medium text-[var(--accent-ink)]"
          : "rounded-md px-3 py-1.5 font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
      }
    >
      {children}
    </button>
  );
}
