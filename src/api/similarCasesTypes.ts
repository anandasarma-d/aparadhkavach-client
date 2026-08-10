/**
 * ADR-020 plain resource from GET /v1/firs/{firId}/similarCases?limit=
 * (Design & Schema §6.7 / Auto/18 A11). Stored-vector cosine neighbors —
 * no Claude comparative essay. Show the returned similarityScore honestly;
 * do not invent an "MO match %".
 *
 * Free-text: GET /v1/firs:search?q=&limit= → {@link FirTextSearch} (same ranked rows).
 */
export type SimilarCase = {
  firId: string;
  /** Cosine similarity in [0, 1]; higher = closer narrative embedding. */
  similarityScore: number;
  district: string;
  crimeType: string;
  /** ISO date (yyyy-mm-dd) or null when unrecorded. */
  dateFiled: string | null;
  status: string;
};

export type SimilarCases = {
  firId: string;
  limit: number;
  similarCases: SimilarCase[];
};

/** Free-text narrative search (embeds query, then ANN). */
export type FirTextSearch = {
  query: string;
  limit: number;
  similarCases: SimilarCase[];
};
