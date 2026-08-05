import { useEffect, useState } from "react";
import { createBootstrapSession, createCatalystSession } from "./api/authClient";
import type { AuthSession } from "./auth/session";
import { clearLogoutPending, isLogoutPending, markLogoutPending } from "./auth/session";
import {
  breakOutOfAuthFrameIfNested,
  bumpLogoutCookieRetry,
  catalystAvailable,
  catalystSignOut,
  clearLogoutCookieRetry,
  clearSignOutAttempted,
  clearSwitchPending,
  consumeSwitchQuery,
  ensureCatalystSdk,
  getLogoutCookieRetry,
  hostedAuthLoginUrl,
  isSwitchPending,
  loggedOutUrl,
  markSignOutAttempted,
  markSwitchPending,
  readCatalystAuthState,
  readCatalystIdentity,
  type CatalystUser,
  redirectCatalystLogoutPath,
  redirectExecutorShellToPublicHost,
  redirectInviteConfirmToPortal,
  warmAuthServices,
} from "./auth/catalyst";
import { RoleMenu } from "./rbac/RoleMenu";
import { DEFAULT_ROLE, type AppRole } from "./rbac/roleMatrix";

type LoginPageProps = {
  onSignedIn: (session: AuthSession) => void;
};

type Mode =
  | "loading"
  | "minting"
  | "sign-in"
  | "fallback"
  | "confirm-redirect"
  | "auth-stuck"
  | "redirecting";

const MAX_LOGOUT_COOKIE_RETRIES = 2;

/** Demo role picker only when explicitly enabled (D-080). Default off on Lane B Slate. */
function allowDevMintUi(): boolean {
  return import.meta.env.VITE_ALLOW_DEV_MINT === "true";
}

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
 * Hosted Auth is the durable primary path (mvp2/10 close-out).
 * Embedded iframe caused D-075 whitespace and D-088 cookie/switch loops — do not remount it.
 * After password, Catalyst returns to service_url=/ → we mint JWT from catalystUserId.
 */
export function LoginPage({ onSignedIn }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>("loading");
  const [role, setRole] = useState<AppRole>(DEFAULT_ROLE);
  const [busy, setBusy] = useState(false);
  const [mintStep, setMintStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function mintFromCatalyst(preferredUser: CatalystUser | null = null) {
      setMode("minting");
      setBusy(true);
      // Start Auth hop ASAP — role is validated server-side (D-080 / D-085).
      setMintStep("Minting AparadhKavach session…");

      const userIdHint =
        preferredUser != null
          ? String(preferredUser.user_id ?? preferredUser.userId ?? "").trim()
          : "";
      const emailHint =
        preferredUser != null ? preferredUser.email_id ?? preferredUser.email : undefined;

      if (userIdHint) {
        // Fast path: isUserAuthenticated already returned the user — skip extra profile RPCs.
        const session = await createCatalystSession({
          catalystUserId: userIdHint,
          email: emailHint,
        });
        if (!cancelled) onSignedIn(session);
        return;
      }

      setMintStep("Reading Catalyst profile…");
      const identity = await readCatalystIdentity(preferredUser);
      if (!identity) {
        throw new Error(
          "Signed in to Catalyst but could not read user profile (getCurrentProjectUser returned empty).",
        );
      }
      setMintStep("Minting AparadhKavach session…");
      const session = await createCatalystSession({
        catalystUserId: identity.sub,
        email: identity.email,
      });
      if (!cancelled) onSignedIn(session);
    }

    async function boot() {
      // Warm Auth/Gateway while SDK loads — Hosted return mint often waits on cold AppSail (D-085).
      warmAuthServices();

      if (breakOutOfAuthFrameIfNested()) {
        setMode("redirecting");
        return;
      }

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

      const wantSwitch = consumeSwitchQuery() || isSwitchPending();
      if (wantSwitch) markSwitchPending();

      const fromLogout = consumeLoggedOutQuery() || isLogoutPending();
      if (fromLogout) {
        markLogoutPending();
      }

      const ok = await ensureCatalystSdk();
      if (cancelled) return;

      if (!ok || !catalystAvailable()) {
        clearLogoutPending();
        clearSignOutAttempted();
        clearLogoutCookieRetry();
        clearSwitchPending();
        if (allowDevMintUi()) {
          setMode("fallback");
        } else {
          setError(
            "Catalyst Auth is unavailable on this host. Use the Slate workbench URL, or set VITE_ALLOW_DEV_MINT=true for local demo mint.",
          );
          setMode("sign-in");
        }
        return;
      }

      /*
       * After Logout / Switch: do not treat a surviving Catalyst cookie as “done”.
       * Prior D-088 path skipped a second clear when wasSignOutAttempted → SPA Sign-in gate loop (D-099).
       * Retry SDK/baas logout a few times, then open Hosted once the cookie is gone.
       */
      if (fromLogout || isLogoutPending() || wantSwitch) {
        try {
          const state = await readCatalystAuthState();
          if (state.authenticated) {
            const retries = getLogoutCookieRetry();
            if (retries < MAX_LOGOUT_COOKIE_RETRIES) {
              bumpLogoutCookieRetry();
              markSignOutAttempted();
              setMode("redirecting");
              // Switch → Hosted; plain Logout → SPA gate (loggedOut) after clear.
              const dest =
                wantSwitch || isSwitchPending() ? hostedAuthLoginUrl() : loggedOutUrl();
              await catalystSignOut(dest);
              return;
            }
            // Exhausted retries — fall through to Sign-in with guidance.
            setError(
              "Catalyst still has an active session cookie. Use Switch account again, or clear site data for this host, then Sign in with email.",
            );
          } else if (wantSwitch || isSwitchPending()) {
            clearLogoutPending();
            clearSignOutAttempted();
            clearLogoutCookieRetry();
            clearSwitchPending();
            setMode("redirecting");
            window.location.assign(hostedAuthLoginUrl());
            return;
          }
        } catch {
          // fall through to sign-in
        }
        clearLogoutPending();
        clearSignOutAttempted();
        clearLogoutCookieRetry();
        if (!wantSwitch) clearSwitchPending();
        if (!cancelled) setMode("sign-in");
        return;
      }

      try {
        const state = await readCatalystAuthState();
        if (state.authenticated) {
          await mintFromCatalyst(state.user);
          return;
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setError(formatAuthError(err));
        setMode("auth-stuck");
        setBusy(false);
        setMintStep(null);
        return;
      } finally {
        if (!cancelled) setBusy(false);
      }

      if (!cancelled) setMode("sign-in");
    }

    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep Auth warm while the officer reads the landing card (D-085).
  useEffect(() => {
    if (mode !== "sign-in") return;
    warmAuthServices();
    const id = window.setInterval(() => warmAuthServices(), 45_000);
    return () => window.clearInterval(id);
  }, [mode]);

  function goHostedSignIn() {
    setError(null);
    setMode("redirecting");
    clearLogoutPending();
    clearSignOutAttempted();
    clearLogoutCookieRetry();
    clearSwitchPending();
    warmAuthServices();
    window.location.assign(hostedAuthLoginUrl());
  }

  function switchAccount() {
    setError(null);
    setMode("redirecting");
    markSignOutAttempted();
    markLogoutPending();
    markSwitchPending();
    clearLogoutCookieRetry();
    // baas → portal → Hosted email form (D-099). Portal-only left cookies → SSO loop.
    void catalystSignOut(hostedAuthLoginUrl());
  }

  const compact =
    mode === "sign-in" ||
    mode === "minting" ||
    mode === "confirm-redirect" ||
    mode === "auth-stuck" ||
    mode === "redirecting";

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-x-hidden bg-[var(--paper)] px-4 py-6 text-[var(--ink)] sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,color-mix(in_srgb,var(--accent-soft)_70%,transparent),transparent_55%)]"
      />

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
              lookup, hotspot forecasts, criminal networks, similar cases, and Q&amp;A.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow)] sm:p-4">
          {mode === "loading" && (
            <p className="text-center text-[14px] text-[var(--ink-muted)]">
              {busy ? "Finishing sign-in…" : "Loading sign-in…"}
            </p>
          )}

          {mode === "minting" && (
            <div className="space-y-2 text-center">
              <p className="text-[14px] font-medium text-[var(--ink)]">Finishing sign-in…</p>
              <p className="text-[13px] text-[var(--ink-muted)]">
                {mintStep ?? "Preparing session…"}
              </p>
            </div>
          )}

          {mode === "redirecting" && (
            <p className="text-center text-[14px] text-[var(--ink-muted)]">
              Opening Catalyst sign-in…
            </p>
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
                <li>Sign out below, then sign in again with email + password.</li>
              </ol>
              <button
                type="button"
                className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-[14px] font-medium text-[var(--ink)]"
                onClick={() => switchAccount()}
              >
                Sign out &amp; switch account
              </button>
              {allowDevMintUi() && (
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
              )}
            </div>
          )}

          {mode === "sign-in" && (
            <div className="space-y-3 text-center">
              <h2 className="text-[1.1rem] font-semibold text-[var(--ink)]">Sign in</h2>
              <p className="text-[13px] leading-relaxed text-[var(--ink-muted)]">
                Use your AparadhKavach Catalyst account (email + password). Hosted sign-in avoids
                the Embedded iframe so account switch and logout stay reliable.
              </p>
              {error && (
                <p className="text-left text-[13px] text-red-700" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="w-full rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2.5 text-[14px] font-semibold text-[var(--accent-ink)]"
                onClick={() => goHostedSignIn()}
              >
                Sign in with email
              </button>
              <button
                type="button"
                className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-[14px] font-medium text-[var(--ink)]"
                onClick={() => switchAccount()}
              >
                Switch account
              </button>
              {allowDevMintUi() && (
                <button
                  type="button"
                  className="w-full text-center font-[family-name:var(--font-mono)] text-[11px] text-[var(--ink-faint)] underline-offset-2 hover:underline"
                  onClick={() => {
                    setError(null);
                    setMode("fallback");
                  }}
                >
                  Use demo role picker instead
                </button>
              )}
            </div>
          )}

          {mode === "fallback" && allowDevMintUi() && (
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
              <button
                type="button"
                className="mt-2 w-full text-center font-[family-name:var(--font-mono)] text-[11px] text-[var(--ink-faint)] underline-offset-2 hover:underline"
                onClick={() => setMode("sign-in")}
              >
                Back to Hosted sign-in
              </button>
            </form>
          )}

          {error && mode !== "auth-stuck" && mode !== "sign-in" && mode !== "redirecting" && (
            <p className="mt-3 text-[13px] text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
