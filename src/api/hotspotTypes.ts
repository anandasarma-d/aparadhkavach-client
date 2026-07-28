/** ADR-020 plain list resource from GET /v1/analytics/hotspots */
export type HotspotRow = {
  forecastId: string;
  districtId: string;
  /** From DataStore districts via analytics; may be null if ROWID unknown */
  districtName?: string | null;
  crimeType: string;
  forecastWindow: string;
  hotspotScore: number;
  confidence: number | null;
  pipelineRunId: string;
  forecastedAt: string;
};

export type HotspotsPage = {
  hotspots: HotspotRow[];
  nextPageToken: string | null;
};
