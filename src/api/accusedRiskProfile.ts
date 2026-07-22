/**
 * Mirrors Investigation Service `AccusedRiskProfileResource` (C1).
 *
 * AGENTS.md §3: prefer openapi-typescript under `src/api/generated/` — that pipeline
 * is not wired in this repo yet, and Investigation Service does not expose springdoc.
 * Replace this file when OpenAPI generation lands; do not let it drift from the Java record.
 */
export type AccusedRiskProfile = {
  accusedId: string;
  name: string;
  addressDistrictId: string;
  priorOffenseCount: number;
  riskScore: number;
  topFeatureImportance: Record<string, number>;
  scoreId: string;
  scoredAt: string;
  pipelineRunId: string;
};
