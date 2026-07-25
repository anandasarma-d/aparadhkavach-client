// Demo RBAC stub (Approach A — Auto/21).
//
// Single source of truth for role -> visible surfaces. This is a PoC capability
// gate in the UI only: it changes which tabs / cross-links a role can open. It is
// NOT authentication and NOT data-row scoping — every API/DataStore response is
// unchanged. Real Catalyst Auth + JWT/Gateway is the designed path (Auto/21
// Approach B), planned post-demo, and can reuse this exact map by supplying
// `role` from the session instead of the demo switcher.

export type DemoRole = "INVESTIGATOR" | "ANALYST" | "SUPERVISOR" | "POLICYMAKER";

export type AppView = "risk" | "hotspots" | "network" | "similar";

/** Canonical left-to-right tab order, independent of role. */
export const NAV_ORDER: readonly AppView[] = ["risk", "hotspots", "network", "similar"];

export const VIEW_LABELS: Record<AppView, string> = {
  risk: "Risk lookup",
  hotspots: "Hotspots",
  network: "Network",
  similar: "Similar cases",
};

/** Roles in the order shown in the switcher. */
export const DEMO_ROLES: readonly DemoRole[] = [
  "INVESTIGATOR",
  "ANALYST",
  "SUPERVISOR",
  "POLICYMAKER",
];

export const ROLE_LABELS: Record<DemoRole, string> = {
  INVESTIGATOR: "Investigator",
  ANALYST: "Analyst",
  SUPERVISOR: "Supervisor",
  POLICYMAKER: "Policymaker",
};

/** Which surfaces each role may open (Auto/21 locked matrix). */
export const ROLE_VIEWS: Record<DemoRole, readonly AppView[]> = {
  INVESTIGATOR: ["risk", "network", "similar"],
  ANALYST: ["hotspots", "risk"],
  SUPERVISOR: ["risk", "hotspots", "network", "similar"],
  POLICYMAKER: ["hotspots"],
};

/** Landing tab when a role is selected. */
export const ROLE_HOME: Record<DemoRole, AppView> = {
  INVESTIGATOR: "risk",
  ANALYST: "hotspots",
  SUPERVISOR: "risk",
  POLICYMAKER: "hotspots",
};

export const DEFAULT_ROLE: DemoRole = "INVESTIGATOR";

export function canSee(role: DemoRole, view: AppView): boolean {
  return ROLE_VIEWS[role].includes(view);
}

/** Tabs visible to a role, in canonical order. */
export function visibleViews(role: DemoRole): AppView[] {
  return NAV_ORDER.filter((v) => canSee(role, v));
}
