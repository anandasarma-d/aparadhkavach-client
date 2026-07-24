/**
 * Mirrors Investigation Service `AccusedRiskProfileResource` (C1).
 *
 * AGENTS.md §3: prefer openapi-typescript under `src/api/generated/` — that pipeline
 * is not wired in this repo yet, and Investigation Service does not expose springdoc.
 * Replace this file when OpenAPI generation lands; do not let it drift from the Java record.
 */
/**
 * Section 7.5.1 engineered features surfaced as per-accused "case drivers" — the real model
 * inputs QuickML scored against (A7 3-Full). These are INPUTS, not per-score attribution.
 * `recidivismIntervalAvg` is null for single-offense accused (rendered as "not applicable").
 * Mirrors Investigation Service `CaseDriverFeaturesResource`.
 */
export type CaseDriverFeatures = {
  offenseCount: number | null;
  recidivismIntervalAvg: number | null;
  crimeTypeSeverityMax: number | null;
  districtSpread: number | null;
  coAccusedCount: number | null;
  daysSinceLastOffense: number | null;
};

export type AccusedRiskProfile = {
  accusedId: string;
  name: string;
  addressDistrictId: string;
  priorOffenseCount: number;
  riskScore: number;
  topFeatureImportance: Record<string, number>;
  /** Nullable: present only when the accused_features enrichment is available (A7 3-Full). */
  caseDrivers: CaseDriverFeatures | null;
  scoreId: string;
  scoredAt: string;
  pipelineRunId: string;
};
