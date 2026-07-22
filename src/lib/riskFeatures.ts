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
