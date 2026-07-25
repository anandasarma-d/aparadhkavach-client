/**
 * Entity-type presentation for the K2 network view.
 *
 * vis-network draws on canvas and cannot read CSS custom properties, so colors are resolved
 * from the live stylesheet at render time (keeps light/dark parity via --graph-* tokens).
 */
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  Accused: "Accused",
  FIR: "FIR",
  Victim: "Victim",
  Witness: "Witness",
  Location: "Location",
  Vehicle: "Vehicle",
  PhoneNumber: "Phone",
  InvestigationOfficer: "Officer",
  CrimeType: "Crime type",
};

/**
 * One dedicated hue per type — Vehicle/Phone intentionally diverge (bronze vs steel blue).
 * Tokens live in index.css so canvas + legend stay in sync.
 */
const TYPE_TOKEN: Record<string, string> = {
  Accused: "--graph-accused",
  FIR: "--graph-fir",
  Victim: "--graph-victim",
  Witness: "--graph-witness",
  Location: "--graph-location",
  Vehicle: "--graph-vehicle",
  PhoneNumber: "--graph-phone",
  InvestigationOfficer: "--graph-officer",
  CrimeType: "--graph-crime",
};

const TYPE_FALLBACK: Record<string, string> = {
  Accused: "#a23b3b",
  FIR: "#2e6e75",
  Victim: "#b45309",
  Witness: "#5b6b7c",
  Location: "#3f7856",
  Vehicle: "#9a6b2f",
  PhoneNumber: "#3d6a9f",
  InvestigationOfficer: "#1d4a4f",
  CrimeType: "#8a94a6",
};

export type D1Palette = {
  color: (type: string) => string;
  ink: string;
  inkMuted: string;
  surface: string;
  line: string;
  accent: string;
};

export function entityTypeLabel(type: string): string {
  return ENTITY_TYPE_LABELS[type] ?? type;
}

/** Reads resolved D1 / graph token values so canvas colors track the active theme. */
export function readD1Palette(element: HTMLElement): D1Palette {
  const styles = getComputedStyle(element);
  const token = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  const inkMuted = token("--ink-muted", "#56637a");
  return {
    color: (type: string) =>
      token(TYPE_TOKEN[type] ?? "--ink-muted", TYPE_FALLBACK[type] ?? inkMuted),
    ink: token("--ink", "#182437"),
    inkMuted,
    surface: token("--surface", "#ffffff"),
    line: token("--line-strong", "#c3c9cc"),
    accent: token("--accent", "#2e6e75"),
  };
}

/** Distinct entity types present, in first-seen order — drives the legend. */
export function presentTypes(nodes: { type: string }[]): string[] {
  const seen: string[] = [];
  for (const node of nodes) {
    if (!seen.includes(node.type)) seen.push(node.type);
  }
  return seen;
}
