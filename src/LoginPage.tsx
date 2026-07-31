import { useEffect, useState } from "react";
import { createBootstrapSession } from "./api/authClient";
import type { AuthSession } from "./auth/session";
import {
  catalystAvailable,
  ensureCatalystSdk,
  isCatalystAuthenticated,
  readCatalystIdentity,
  startEmbeddedSignIn,
} from "./auth/catalyst";
import { RoleMenu } from "./rbac/RoleMenu";
import { DEFAULT_ROLE, type AppRole } from "./rbac/roleMatrix";

type LoginPageProps = {
  onSignedIn: (session: AuthSession) => void;
};

type Mode = "loading" | "embedded" | "fallback";

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
      const ok = await ensureCatalystSdk();
      if (cancelled) return;

      if (!ok || !catalystAvailable()) {
        setMode("fallback");
        return;
      }

      try {
        if (await isCatalystAuthenticated()) {
          setBusy(true);
          const identity = await readCatalystIdentity();
          if (!identity) {
            throw new Error("Signed in to Catalyst but could not read user profile");
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
        }
      } finally {
        if (!cancelled) setBusy(false);
      }

      setMode("embedded");
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

  const compact = mode === "embedded";

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-x-hidden bg-[var(--paper)] px-4 py-6 text-[var(--ink)] sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,color-mix(in_srgb,var(--accent-soft)_70%,transparent),transparent_55%)]"
      />

      <style>{`
        /* Catalyst default CSS keeps inactive panels hidden; we only clip the tall empty iframe. */
        #catalyst-login,
        #catalyst-forgot {
          overflow: hidden;
        }
        #catalyst-login iframe {
          display: block;
          width: 100% !important;
          max-width: 100%;
          /* Active form sits at the top; clip the ~520px empty band below. */
          height: 340px !important;
          min-height: 0 !important;
          border: 0 !important;
        }
        #catalyst-forgot iframe {
          display: block;
          width: 100% !important;
          max-width: 100%;
          height: 380px !important;
          min-height: 0 !important;
          border: 0 !important;
        }
      `}</style>

      <main className={`relative w-full ${compact ? "max-w-[26rem]" : "max-w-[26rem]"}`}>
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

          {mode === "embedded" && (
            <>
              <p className="mb-2 text-center text-[13px] text-[var(--ink-muted)]">
                Sign in with your AparadhKavach account
              </p>
              {/* Hosts stay white — paper bg was the grey strip above Catalyst's "Sign in". */}
              <div id="catalyst-login" className="w-full [&:empty]:min-h-[10rem]" />
              <div id="catalyst-forgot" className="mt-1 w-full empty:hidden" />
              <p className="mt-3 text-center text-[11px] leading-snug text-[var(--ink-faint)]">
                New users: after email, use <span className="font-medium">Set password now</span> /
                Forgot password. If that step is blank, enable Hosted Auth in Catalyst and re-invite.
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

          {error && (
            <p className="mt-3 text-[13px] text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
