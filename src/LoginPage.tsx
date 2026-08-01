import { useEffect, useState } from "react";
import { createBootstrapSession } from "./api/authClient";
import type { AuthSession } from "./auth/session";
import { clearLogoutPending, isLogoutPending, markLogoutPending } from "./auth/session";
import {
  catalystAvailable,
  catalystSignOut,
  ensureCatalystSdk,
  isCatalystAuthenticated,
  redirectInviteConfirmToPortal,
  readCatalystIdentity,
  startEmbeddedSignIn,
} from "./auth/catalyst";
import { RoleMenu } from "./rbac/RoleMenu";
import { DEFAULT_ROLE, type AppRole } from "./rbac/roleMatrix";

type LoginPageProps = {
  onSignedIn: (session: AuthSession) => void;
};

type Mode = "loading" | "embedded" | "fallback" | "confirm-redirect" | "auth-stuck";

/**
 * Prefer Catalyst Embedded Auth iframe (mvp2/10). Falls back to role picker when
 * SDK/init.js is unavailable (local Vite) or Embedded fails to mount.
 * JWT mint still uses AUTH_ALLOW_DEV_MINT until server-side Catalyst exchange lands.
 */
export function LoginPage({ onSignedIn }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>("loading");
  const [role, setRole] = useState<AppRole>(DEFAULT_ROLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      // Invite links hit Slate `/accounts/.../pconfirm` → SPA. Bounce to Zoho portal.
      if (redirectInviteConfirmToPortal()) {
        setMode("confirm-redirect");
        return;
      }

      const ok = await ensureCatalystSdk();
      if (cancelled) return;

      if (!ok || !catalystAvailable()) {
        clearLogoutPending();
        setMode("fallback");
        return;
      }

      // After Logout: finish Catalyst sign-out if the cookie is still present, then
      // show login — do not auto-mint (that was re-entering the app immediately).
      if (isLogoutPending()) {
        try {
          if (await isCatalystAuthenticated()) {
            await catalystSignOut("/");
            return;
          }
        } catch {
          // fall through to login UI
        }
        if (!cancelled) {
          clearLogoutPending();
          setMode("embedded");
        }
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
          const session = await createBootstrapSession(identity.role, {
            sub: identity.sub,
            displayName: identity.displayName,
          });
          if (!cancelled) onSignedIn(session);
          return;
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          // Already authenticated but cannot mint — do not remount Embedded (empty iframe loop).
          setMode("auth-stuck");
          setBusy(false);
          return;
        }
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

  const compact =
    mode === "embedded" || mode === "confirm-redirect" || mode === "auth-stuck";

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-x-hidden bg-[var(--paper)] px-4 py-6 text-[var(--ink)] sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,color-mix(in_srgb,var(--accent-soft)_70%,transparent),transparent_55%)]"
      />

      <style>{`
        /* Clip Catalyst's fixed ~520px iframe; active form stays at the top. */
        #catalyst-login {
          overflow: hidden;
          max-height: 300px;
        }
        #catalyst-login iframe {
          display: block;
          width: 100% !important;
          max-width: 100%;
          height: 300px !important;
          min-height: 0 !important;
          border: 0 !important;
          /* Crop faint grey portal_logo / top chrome Catalyst leaves above "Sign in". */
          margin-top: -8px;
        }
      `}</style>

      <main className="relative w-full max-w-[26rem]">
        <div className={`flex flex-col items-center text-center ${compact ? "mb-4" : "mb-8"}`}>
          <img
            src="/aparadhkavach-logo.png"
            alt="AparadhKavach logo"
            className={compact ? "mb-3 h-16 w-16" : "mb-5 h-28 w-28"}
          />
          <h1
            className={`font-[family-name:var(--font-display)] font-normal tracking-tight text-[var(--ink)] ${
              compact ? "text-[1.65rem]" : "text-[2rem]"
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

        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)] sm:p-5">
          {mode === "loading" && (
            <p className="text-center text-[14px] text-[var(--ink-muted)]">
              {busy ? "Finishing sign-in…" : "Loading sign-in…"}
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
                <li>Sign out of Catalyst below, then reload and sign in again with email + password.</li>
                <li>Or use the demo role picker for Lane B demos.</li>
              </ol>
              <button
                type="button"
                className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-[14px] font-medium text-[var(--ink)]"
                onClick={() => {
                  markLogoutPending();
                  void catalystSignOut("/");
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
              <p className="mb-2 text-center text-[13px] text-[var(--ink-muted)]">
                Sign in with your AparadhKavach account
              </p>
              <div id="catalyst-login" className="w-full [&:empty]:min-h-[12rem]" />
              <p className="mt-3 text-center text-[11px] leading-snug text-[var(--ink-faint)]">
                New users: open the invite link (after redeploy it jumps to{" "}
                <span className="font-[family-name:var(--font-mono)]">accounts.zohoportal.in</span>
                ), set password until Confirm=Yes, then sign in here. Or use the demo picker.
              </p>
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
                    setError(err instanceof Error ? err.message : String(err));
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

          {error && mode !== "auth-stuck" && (
            <p className="mt-3 text-[13px] text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
