import { useEffect, useState } from "react";
import { createBootstrapSession, createCatalystSession } from "./api/authClient";
import type { AuthSession } from "./auth/session";
import { clearLogoutPending, isLogoutPending } from "./auth/session";
import {
  breakOutOfAuthFrameIfNested,
  catalystAvailable,
  catalystSignOut,
  clearLogoutCookieRetry,
  clearSignOutAttempted,
  clearSwitchPending,
  consumeAuthReturnQuery,
  ensureCatalystSdk,
  hostedAuthLoginUrl,
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
  | "fallback"
  | "confirm-redirect"
  | "auth-stuck"
  | "redirecting"
  | "unavailable";

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
 * Hosted Auth is the only sign-in UI (Catalyst email/password).
 * No SPA “Sign in with email / Switch account” gate — that overcomplicated logout (D-099).
 * Flow: unauthenticated → `/__catalyst/auth/login`; after password → `/` → mint JWT.
 */
export function LoginPage({ onSignedIn }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>("loading");
  const [role, setRole] = useState<AppRole>(DEFAULT_ROLE);
  const [busy, setBusy] = useState(false);
  const [mintStep, setMintStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function goHosted() {
      clearLogoutPending();
      clearSignOutAttempted();
      clearLogoutCookieRetry();
      clearSwitchPending();
      warmAuthServices();
      setMode("redirecting");
      window.location.replace(hostedAuthLoginUrl());
    }

    async function mintFromCatalyst(preferredUser: CatalystUser | null = null) {
      setMode("minting");
      setBusy(true);
      setMintStep("Minting AparadhKavach session…");

      const userIdHint =
        preferredUser != null
          ? String(preferredUser.user_id ?? preferredUser.userId ?? "").trim()
          : "";
      const emailHint =
        preferredUser != null ? preferredUser.email_id ?? preferredUser.email : undefined;

      if (userIdHint) {
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

      // Logout sets logoutPending then navigates to Hosted. That flag survives in
      // sessionStorage across the Hosted round-trip. Only force Hosted again when we
      // landed on the SPA *without* authReturn (D-101). After password, Hosted returns
      // to /?authReturn=1 → clear flags and mint.
      const authReturn = consumeAuthReturnQuery();
      const fromLogout = consumeLoggedOutQuery() || isLogoutPending();
      if (fromLogout) {
        clearLogoutPending();
        clearSignOutAttempted();
        clearLogoutCookieRetry();
        clearSwitchPending();
        if (!authReturn) {
          if (!cancelled) goHosted();
          return;
        }
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
          setMode("unavailable");
        }
        return;
      }

      try {
        const state = await readCatalystAuthState();
        if (state.authenticated) {
          await mintFromCatalyst(state.user);
          return;
        }
        // Hosted return sometimes races the cookie — brief retry before bouncing again.
        if (authReturn) {
          await new Promise((r) => setTimeout(r, 400));
          const retry = await readCatalystAuthState();
          if (retry.authenticated) {
            await mintFromCatalyst(retry.user);
            return;
          }
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

      // Not signed in to Catalyst → Hosted email/password (no SPA gate).
      if (!cancelled) goHosted();
    }

    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signOutToHosted() {
    setError(null);
    setMode("redirecting");
    void catalystSignOut(hostedAuthLoginUrl());
  }

  const compact =
    mode === "minting" ||
    mode === "confirm-redirect" ||
    mode === "auth-stuck" ||
    mode === "redirecting" ||
    mode === "unavailable";

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

          {mode === "unavailable" && (
            <div className="space-y-3 text-center">
              <h2 className="text-[1.1rem] font-semibold text-[var(--ink)]">Sign-in unavailable</h2>
              {error && (
                <p className="text-left text-[13px] text-red-700" role="alert">
                  {error}
                </p>
              )}
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
                onClick={() => signOutToHosted()}
              >
                Sign out
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
                onClick={() => signOutToHosted()}
              >
                Use Hosted sign-in
              </button>
            </form>
          )}

          {error && mode !== "auth-stuck" && mode !== "unavailable" && mode !== "redirecting" && (
            <p className="mt-3 text-[13px] text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
