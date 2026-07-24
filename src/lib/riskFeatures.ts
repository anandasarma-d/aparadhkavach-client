/** Section 7.5.1 feature keys → investigator-facing labels (declaration order). */
export const FEATURE_LABELS: Record<string, string> = {
  offense_count: "Offense count",
  recidivism_interval_avg: "Average recidivism interval",
  crime_type_severity_max: "Maximum offense severity",
  district_spread: "Districts spanned",
  co_accused_count: "Co-accused network size",
  days_since_last_offense: "Days since last offense",
  modus_operandi_consistency: "Modus operandi consistency",
};

export function featureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? key.replaceAll("_", " ");
}

/** Risk bands aligned with Section 11.8 thresholds on the 0–100 score scale. */
export type RiskBand = "low" | "moderate" | "high";

export function riskBand(score: number): RiskBand {
  if (score >= 70) return "high";
  if (score >= 40) return "moderate";
  return "low";
}

export function riskBandLabel(band: RiskBand): string {
  if (band === "high") return "High";
  if (band === "moderate") return "Moderate";
  return "Low";
}

/** Top-3 by absolute weight; ties keep API map iteration order (backend already ranked). */
export function topFeatures(
  importance: Record<string, number>,
  limit = 3,
): { key: string; weight: number }[] {
  return Object.entries(importance)
    .map(([key, weight]) => ({ key, weight: weight ?? 0 }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, limit);
}

/**
 * QuickML crime_type_severity ordinal (LOW/MEDIUM/HIGH/CRITICAL → 1..4), per the Neo4j driver's
 * SEVERITY_ORDINAL. Used to render a readable label alongside the raw value.
 */
const SEVERITY_LABEL: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Critical",
};

export type CaseDriverRow = {
  key: string;
  label: string;
  value: string;
  /** Extra clarification, e.g. why a value is not applicable. */
  note?: string;
};

/**
 * Model-input case drivers in investigator-facing order (strongest overall drivers first, matching
 * ADR-030's training-level Gain ranking). These are the real per-accused inputs to QuickML — NOT
 * per-score attribution. Nulls (e.g. recidivism for single-offense accused) are shown honestly as
 * "not applicable", never coerced to 0.
 */
export function caseDriverRows(drivers: {
  offenseCount: number | null;
  recidivismIntervalAvg: number | null;
  crimeTypeSeverityMax: number | null;
  districtSpread: number | null;
  coAccusedCount: number | null;
  daysSinceLastOffense: number | null;
}): CaseDriverRow[] {
  const num = (v: number | null, suffix = "") =>
    v === null || Number.isNaN(v) ? null : `${v}${suffix}`;

  const severity =
    drivers.crimeTypeSeverityMax === null
      ? null
      : `${SEVERITY_LABEL[drivers.crimeTypeSeverityMax] ?? "—"} (${drivers.crimeTypeSeverityMax}/4)`;

  const rows: (CaseDriverRow | null)[] = [
    {
      key: "offense_count",
      label: FEATURE_LABELS.offense_count,
      value: num(drivers.offenseCount) ?? "—",
    },
    {
      key: "crime_type_severity_max",
      label: FEATURE_LABELS.crime_type_severity_max,
      value: severity ?? "—",
    },
    {
      key: "days_since_last_offense",
      label: FEATURE_LABELS.days_since_last_offense,
      value: num(drivers.daysSinceLastOffense, " days") ?? "—",
    },
    {
      key: "co_accused_count",
      label: FEATURE_LABELS.co_accused_count,
      value: num(drivers.coAccusedCount) ?? "—",
    },
    {
      key: "district_spread",
      label: FEATURE_LABELS.district_spread,
      value: num(drivers.districtSpread) ?? "—",
    },
    {
      key: "recidivism_interval_avg",
      label: FEATURE_LABELS.recidivism_interval_avg,
      value: num(drivers.recidivismIntervalAvg, " days") ?? "Not applicable",
      note:
        drivers.recidivismIntervalAvg === null
          ? "No repeat interval — single offense on record"
          : undefined,
    },
  ];

  return rows.filter((r): r is CaseDriverRow => r !== null);
}

/**
 * Static, model-level (not per-score) top drivers from ADR-030's QuickML training Gain ranking.
 * Shown clearly labelled as training-level importance — never as this record's SHAP.
 */
export const TRAINING_TOP_DRIVERS = [
  "Offense count",
  "Maximum offense severity",
  "Days since last offense",
] as const;
