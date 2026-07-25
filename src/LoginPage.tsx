import { useState } from "react";
import { RoleMenu } from "./rbac/RoleMenu";
import { DEFAULT_ROLE, type DemoRole } from "./rbac/demoRoleMatrix";

type LoginPageProps = {
  onSignIn: (role: DemoRole) => void;
};

/**
 * Demo Sign-In gate (Approach A) — persona picker only. Not Catalyst Auth / JWT.
 */
export function LoginPage({ onSignIn }: LoginPageProps) {
  const [role, setRole] = useState<DemoRole>(DEFAULT_ROLE);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6 text-[var(--ink)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,color-mix(in_srgb,var(--accent-soft)_70%,transparent),transparent_55%)]"
      />

      <main className="relative w-full max-w-[26rem]">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src="/aparadhkavach-logo.png"
            alt="AparadhKavach logo"
            className="mb-5 h-16 w-16"
          />
          <h1 className="font-[family-name:var(--font-display)] text-[2rem] font-normal tracking-tight text-[var(--ink)]">
            AparadhKavach
          </h1>
          <p className="mt-2 max-w-[22rem] text-[14.5px] leading-relaxed text-[var(--ink-muted)]">
            Decision support for Karnataka Police — risk lookup, hotspot forecasts,
            criminal networks, and similar cases.
          </p>
        </div>

        <form
          className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]"
          onSubmit={(e) => {
            e.preventDefault();
            onSignIn(role);
          }}
        >
          <label className="mb-2 block font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.08em] text-[var(--ink-faint)]">
            Sign-In as
          </label>
          <RoleMenu
            role={role}
            onChange={setRole}
            label="Sign-In as"
            size="comfortable"
            className="w-full"
          />

          <button
            type="submit"
            className="mt-4 w-full rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2.5 text-[14px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Continue
          </button>

          <p className="mt-3 text-center text-[11px] leading-snug text-[var(--ink-faint)]">
            Demo RBAC stub — chooses which surfaces you can open. Not Catalyst Auth / JWT yet.
          </p>
        </form>
      </main>
    </div>
  );
}
