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

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6 text-[var(--ink)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,color-mix(in_srgb,var(--accent-soft)_70%,transparent),transparent_55%)]"
      />

      <main className="relative w-full max-w-[28rem]">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src="/aparadhkavach-logo.png"
            alt="AparadhKavach logo"
            className="mb-5 h-28 w-28"
          />
          <h1 className="font-[family-name:var(--font-display)] text-[2rem] font-normal tracking-tight text-[var(--ink)]">
            AparadhKavach
          </h1>
          <p className="mt-2 max-w-[23rem] text-[14.5px] leading-relaxed text-[var(--ink-muted)]">
            Crime Intelligence Platform for Karnataka Police — Support for risk
            lookup, hotspot forecasts, criminal networks, and similar cases.
          </p>
        </div>

        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
          {mode === "loading" && (
            <p className="text-center text-[14px] text-[var(--ink-muted)]">
              {busy ? "Finishing sign-in…" : "Loading sign-in…"}
            </p>
          )}

          {mode === "embedded" && (
            <>
              <p className="mb-3 text-center text-[13px] text-[var(--ink-muted)]">
                Sign in with your AparadhKavach account
              </p>
              <div
                id="catalyst-login"
                className="min-h-[22rem] w-full overflow-hidden rounded-md border border-[var(--line)] bg-[var(--paper)]"
              />
              <button
                type="button"
                className="mt-3 w-full text-center font-[family-name:var(--font-mono)] text-[11px] text-[var(--ink-faint)] underline-offset-2 hover:underline"
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
