/**
 * Client view registry (mvp2/10).
 *
 * Capability matrix SoT is auth-service (`views[]` on session/JWT). This module only
 * knows how to label/order view ids returned by the server.
 */

export type AppRole = "INVESTIGATOR" | "ANALYST" | "SUPERVISOR" | "POLICYMAKER";

export type AppView = "risk" | "hotspots" | "network" | "similar";

/** Canonical left-to-right tab order. */
export const NAV_ORDER: readonly AppView[] = ["risk", "hotspots", "network", "similar"];

export const VIEW_LABELS: Record<AppView, string> = {
  risk: "Risk lookup",
  hotspots: "Hotspots",
  network: "Network",
  similar: "Similar cases",
};

/** Bootstrap mint UI only — not the capability matrix. */
export const BOOTSTRAP_ROLES: readonly AppRole[] = [
  "INVESTIGATOR",
  "ANALYST",
  "SUPERVISOR",
  "POLICYMAKER",
];

export const ROLE_LABELS: Record<AppRole, string> = {
  INVESTIGATOR: "Investigator",
  ANALYST: "Analyst",
  SUPERVISOR: "Supervisor",
  POLICYMAKER: "Policymaker",
};

export const DEFAULT_ROLE: AppRole = "INVESTIGATOR";

const KNOWN_VIEWS = new Set<string>(NAV_ORDER);

export function parseAppViews(raw: unknown): AppView[] {
  if (!Array.isArray(raw)) return [];
  const out: AppView[] = [];
  for (const v of raw) {
    if (typeof v === "string" && KNOWN_VIEWS.has(v) && !out.includes(v as AppView)) {
      out.push(v as AppView);
    }
  }
  return NAV_ORDER.filter((v) => out.includes(v));
}

export function canSee(views: readonly AppView[], view: AppView): boolean {
  return views.includes(view);
}

export function visibleViews(views: readonly AppView[]): AppView[] {
  return NAV_ORDER.filter((v) => views.includes(v));
}

export function homeView(views: readonly AppView[], preferred?: string | null): AppView {
  if (preferred && KNOWN_VIEWS.has(preferred) && views.includes(preferred as AppView)) {
    return preferred as AppView;
  }
  return views[0] ?? "risk";
}

/** @deprecated Use AppRole — kept for RoleMenu during bootstrap. */
export type DemoRole = AppRole;
/** @deprecated Use BOOTSTRAP_ROLES */
export const DEMO_ROLES = BOOTSTRAP_ROLES;
