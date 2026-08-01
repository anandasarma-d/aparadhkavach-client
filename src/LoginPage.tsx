import { useEffect, useState } from "react";
import { createBootstrapSession, createCatalystSession } from "./api/authClient";
import type { AuthSession } from "./auth/session";
import { clearLogoutPending, isLogoutPending, markLogoutPending } from "./auth/session";
import {
  breakOutOfAuthFrameIfNested,
  catalystAvailable,
  catalystSignOut,
  clearSignOutAttempted,
  ensureCatalystSdk,
  isCatalystAuthenticated,
  loggedOutUrl,
  markSignOutAttempted,
  redirectCatalystLogoutPath,
  redirectExecutorShellToPublicHost,
  redirectInviteConfirmToPortal,
  readCatalystIdentity,
  startEmbeddedSignIn,
  wasSignOutAttempted,
} from "./auth/catalyst";
import { RoleMenu } from "./rbac/RoleMenu";
import { DEFAULT_ROLE, type AppRole } from "./rbac/roleMatrix";

type LoginPageProps = {
  onSignedIn: (session: AuthSession) => void;
};

type Mode =
  | "loading"
  | "embedded"
  | "fallback"
  | "confirm-redirect"
  | "auth-stuck"
  | "redirecting"
  | "post-logout";

function consumeLoggedOutQuery(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get("loggedOut") !== "1") return false;
  params.delete("loggedOut");
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", next || "/");
  return true;
}

function formatAuthError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  const raw = String(err ?? "").trim();
  if (raw && raw !== "Error" && raw !== "[object Object]") return raw;
  return "Could not finish AparadhKavach sign-in (session mint or Catalyst profile failed).";
}

/**
 * Prefer Catalyst Embedded Auth iframe (mvp2/10). Falls back to role picker when
 * SDK/init.js is unavailable (local Vite) or Embedded fails to mount.
 * Embedded path mints via catalystUserId exchange (server looks up role). Role picker
 * still needs AUTH_ALLOW_DEV_MINT on Auth Service.
 */
export function LoginPage({ onSignedIn }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>("loading");
  const [role, setRole] = useState<AppRole>(DEFAULT_ROLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      // D-081: SPA loaded inside Embedded iframe after service_url → break to top.
      if (breakOutOfAuthFrameIfNested()) {
        setMode("redirecting");
        return;
      }

      // Executor /accounts/logout is SPA-swallowed — bounce to zohoportal so cookies clear.
      if (redirectCatalystLogoutPath()) {
        setMode("redirecting");
        return;
      }

      if (redirectInviteConfirmToPortal()) {
        setMode("confirm-redirect");
        return;
      }

      if (redirectExecutorShellToPublicHost()) {
        setMode("redirecting");
        return;
      }

      const fromLogout = consumeLoggedOutQuery() || isLogoutPending();
      if (fromLogout) {
        markLogoutPending();
      }

      const ok = await ensureCatalystSdk();
      if (cancelled) return;

      if (!ok || !catalystAvailable()) {
        if (fromLogout) {
          // Still block auto paths; picker is ok after explicit logout.
          clearLogoutPending();
          clearSignOutAttempted();
        }
        setMode("fallback");
        return;
      }

      /*
       * After Logout: never auto-mint and do not mount Embedded while a Catalyst
       * session may still be valid — signIn() would bounce to service_url and mint
       * straight back into the app (logout regression).
       */
      if (fromLogout || isLogoutPending()) {
        try {
          const stillIn = await isCatalystAuthenticated();
          if (stillIn && !wasSignOutAttempted()) {
            markSignOutAttempted();
            await catalystSignOut(loggedOutUrl());
            return;
          }
          if (stillIn) {
            // Cookie survived signOut swallow — require explicit user action.
            if (!cancelled) setMode("post-logout");
            return;
          }
        } catch {
          // fall through to post-logout gate
        }
        if (!cancelled) setMode("post-logout");
        return;
      }

      try {
        if (await isCatalystAuthenticated()) {
          setBusy(true);
          const identity = await readCatalystIdentity();
          if (!identity) {
            throw new Error(
              "Signed in to Catalyst but could not read user profile (getCurrentProjectUser returned empty).",
            );
          }
          const session = await createCatalystSession({
            catalystUserId: identity.sub,
            email: identity.email,
          });
          if (!cancelled) onSignedIn(session);
          return;
        }
      } catch (err: unknown) {
        if (cancelled) return;
        // Do not auto sign-out here — that raced with logout and reminted (regression).
        setError(formatAuthError(err));
        setMode("auth-stuck");
        setBusy(false);
        return;
      } finally {
        if (!cancelled) setBusy(false);
      }

      if (!cancelled) setMode("embedded");
    }

    void boot();
    return () => {
      cancelled = true;
    };
    // Intentionally once on mount — onSignedIn is stable enough for this gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "embedded") return;
    try {
      startEmbeddedSignIn("catalyst-login");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setMode("fallback");
    }
  }, [mode]);

  async function beginSignInAfterLogout() {
    setError(null);
    setBusy(true);
    try {
      // User explicitly wants to sign in — never call signOut here (that returned to
      // Signed out forever when Catalyst cookies still present — D-086).
      clearLogoutPending();
      clearSignOutAttempted();

      if (await isCatalystAuthenticated()) {
        // Cookie survived portal logout: re-enter app as that user (JWT was cleared).
        const identity = await readCatalystIdentity();
        if (!identity) {
          throw new Error(
            "Still signed in to Catalyst but could not read profile. Use Switch account or demo picker.",
          );
        }
        const session = await createCatalystSession({
          catalystUserId: identity.sub,
          email: identity.email,
        });
        onSignedIn(session);
        return;
      }
      setMode("embedded");
    } catch (err: unknown) {
      setError(formatAuthError(err));
      setMode("embedded");
    } finally {
      setBusy(false);
    }
  }

  function switchAccountAfterLogout() {
    markLogoutPending();
    markSignOutAttempted();
    void catalystSignOut(loggedOutUrl());
  }

  const compact =
    mode === "embedded" ||
    mode === "confirm-redirect" ||
    mode === "auth-stuck" ||
    mode === "redirecting" ||
    mode === "post-logout";

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-x-hidden bg-[var(--paper)] px-4 py-6 text-[var(--ink)] sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,color-mix(in_srgb,var(--accent-soft)_70%,transparent),transparent_55%)]"
      />

      <style>{`
        /* Catalyst default box is ~520px; clip to content height so the card is not empty. */
        #catalyst-login {
          overflow: hidden;
          max-height: 220px;
        }
        #catalyst-login iframe {
          display: block;
          width: 100% !important;
          max-width: 100%;
          height: 220px !important;
          min-height: 0 !important;
          border: 0 !important;
          margin-top: -12px;
        }
      `}</style>

      <main className="relative w-full max-w-[24rem]">
        <div className={`flex flex-col items-center text-center ${compact ? "mb-3" : "mb-8"}`}>
          <img
            src="/aparadhkavach-logo.png"
            alt="AparadhKavach logo"
            className={compact ? "mb-2 h-14 w-14" : "mb-5 h-28 w-28"}
          />
          <h1
            className={`font-[family-name:var(--font-display)] font-normal tracking-tight text-[var(--ink)] ${
              compact ? "text-[1.5rem]" : "text-[2rem]"
            }`}
          >
            AparadhKavach
          </h1>
          {!compact && (
            <p className="mt-2 max-w-[23rem] text-[14.5px] leading-relaxed text-[var(--ink-muted)]">
              Crime Intelligence Platform for Karnataka Police — Support for risk
              lookup, hotspot forecasts, criminal networks, and similar cases.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow)] sm:p-4">
          {mode === "loading" && (
            <p className="text-center text-[14px] text-[var(--ink-muted)]">
              {busy ? "Finishing sign-in…" : "Loading sign-in…"}
            </p>
          )}

          {mode === "redirecting" && (
            <p className="text-center text-[14px] text-[var(--ink-muted)]">
              Finishing sign-out…
            </p>
          )}

          {mode === "post-logout" && (
            <div className="space-y-3 text-center">
              <h2 className="text-[1.1rem] font-semibold text-[var(--ink)]">Signed out</h2>
              <p className="text-[13px] leading-relaxed text-[var(--ink-muted)]">
                AparadhKavach session cleared. Sign in again with email and password, switch
                Catalyst account, or use the demo role picker.
              </p>
              {error && (
                <p className="text-left text-[13px] text-red-700" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                disabled={busy}
                className="w-full rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2.5 text-[14px] font-semibold text-[var(--accent-ink)] disabled:opacity-60"
                onClick={() => void beginSignInAfterLogout()}
              >
                {busy ? "Working…" : "Sign in with email"}
              </button>
              <button
                type="button"
                disabled={busy}
                className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-[14px] font-medium text-[var(--ink)] disabled:opacity-60"
                onClick={() => switchAccountAfterLogout()}
              >
                Switch account (Catalyst sign-out)
              </button>
              <button
                type="button"
                className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-[14px] font-medium text-[var(--ink)]"
                onClick={() => {
                  clearLogoutPending();
                  clearSignOutAttempted();
                  setError(null);
                  setMode("fallback");
                }}
              >
                Use demo role picker
              </button>
            </div>
          )}

          {mode === "confirm-redirect" && (
            <div className="space-y-3 text-center">
              <h2 className="text-[1.1rem] font-semibold text-[var(--ink)]">
                Opening set-password…
              </h2>
              <p className="text-[13px] leading-relaxed text-[var(--ink-muted)]">
                Redirecting invite link to{" "}
                <span className="font-[family-name:var(--font-mono)] text-[12px]">
                  accounts.zohoportal.in
                </span>
                .
              </p>
            </div>
          )}

          {mode === "auth-stuck" && (
            <div className="space-y-3 text-center">
              <h2 className="text-[1.1rem] font-semibold text-[var(--ink)]">
                Catalyst session found — app login blocked
              </h2>
              {error && (
                <p className="text-left text-[13px] text-red-700" role="alert">
                  {error}
                </p>
              )}
              <ol className="list-decimal space-y-1.5 pl-5 text-left text-[13px] leading-relaxed text-[var(--ink-muted)]">
                <li>
                  Console → Users → Edit the signed-in user → set role to exactly{" "}
                  <span className="font-[family-name:var(--font-mono)] text-[12px]">
                    INVESTIGATOR
                  </span>{" "}
                  / ANALYST / SUPERVISOR / POLICYMAKER (not App Administrator / App User).
                </li>
                <li>Sign out of Catalyst below, then reload and sign in again with email + password.</li>
                <li>Or use the demo role picker for Lane B demos.</li>
              </ol>
              <button
                type="button"
                className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-[14px] font-medium text-[var(--ink)]"
                onClick={() => {
                  markLogoutPending();
                  clearSignOutAttempted();
                  markSignOutAttempted();
                  void catalystSignOut(loggedOutUrl());
                }}
              >
                Sign out of Catalyst & reload
              </button>
              <button
                type="button"
                className="w-full rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2.5 text-[14px] font-semibold text-[var(--accent-ink)]"
                onClick={() => {
                  setError(null);
                  setMode("fallback");
                }}
              >
                Use demo role picker
              </button>
            </div>
          )}

          {mode === "embedded" && (
            <>
              <p className="mb-1.5 text-center text-[13px] text-[var(--ink-muted)]">
                Sign in with your AparadhKavach account
              </p>
              <div id="catalyst-login" className="w-full" />
              <button
                type="button"
                className="mt-2 w-full text-center font-[family-name:var(--font-mono)] text-[11px] text-[var(--ink-faint)] underline-offset-2 hover:underline"
                onClick={() => setMode("fallback")}
              >
                Use demo role picker instead
              </button>
            </>
          )}

          {mode === "fallback" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setBusy(true);
                setError(null);
                void createBootstrapSession(role)
                  .then(onSignedIn)
                  .catch((err: unknown) => {
                    setError(formatAuthError(err));
                  })
                  .finally(() => setBusy(false));
              }}
            >
              <label
                htmlFor="sign-in-role"
                className="mb-2 block font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.08em] text-[var(--ink-faint)]"
              >
                Sign-In as
              </label>
              <RoleMenu
                id="sign-in-role"
                role={role}
                onChange={setRole}
                label=""
                size="comfortable"
                variant="field"
                className="w-full"
              />

              <button
                type="submit"
                disabled={busy}
                className="mt-4 w-full rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2.5 text-[14px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
              >
                {busy ? "Signing in…" : "Continue"}
              </button>
            </form>
          )}

          {error && mode !== "auth-stuck" && mode !== "redirecting" && mode !== "post-logout" && (
            <p className="mt-3 text-[13px] text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
