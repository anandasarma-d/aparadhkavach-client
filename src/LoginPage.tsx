import { useState } from "react";
import { createBootstrapSession } from "./api/authClient";
import type { AuthSession } from "./auth/session";
import { RoleMenu } from "./rbac/RoleMenu";
import { DEFAULT_ROLE, type AppRole } from "./rbac/roleMatrix";

type LoginPageProps = {
  onSignedIn: (session: AuthSession) => void;
};

/**
 * Role Sign-In (mvp2/10 interim): mints JWT via Gateway while AUTH_ALLOW_DEV_MINT is on.
 * Replace with Catalyst Embedded Auth once Hosted set-password / Confirm works on Slate.
 */
export function LoginPage({ onSignedIn }: LoginPageProps) {
  const [role, setRole] = useState<AppRole>(DEFAULT_ROLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6 text-[var(--ink)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,color-mix(in_srgb,var(--accent-soft)_70%,transparent),transparent_55%)]"
      />

      <main className="relative w-full max-w-[26rem]">
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

        <form
          className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"
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

          {error && (
            <p className="mt-3 text-[13px] text-red-700" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2.5 text-[14px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Continue"}
          </button>
        </form>
      </main>
    </div>
  );
}
