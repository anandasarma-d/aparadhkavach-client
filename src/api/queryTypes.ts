export type RelatedEntity = {
  id: string;
  type: string;
  label: string;
};

/** Conversational Q&A envelope from POST /v1/queries:ask (mvp2/11). */
export type QueryResult = {
  queryId: string;
  conversationId: string;
  answer: string;
  evidenceSources: string[];
  relatedFirs: string[];
  relatedEntities: RelatedEntity[];
  confidenceScore: number;
  reasoningSummary: string;
  latencyMs: number;
  /** Present on voice follow-up responses (mvp2/12 Step H). */
  transcription?: string;
  transcriptionConfidence?: number;
  transcriptionConfidenceTier?: string;
  needsConfirmation?: boolean;
  detectedLanguage?: string;
};
