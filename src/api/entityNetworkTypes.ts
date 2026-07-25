/**
 * ADR-020 plain resource from GET /v1/entities/{entityId}/network?depth=
 * (Design & Schema §6.7 / Auto/17 A9). Flat nodes+edges — no community detection,
 * no Claude summary in MVP-1.
 */
export type NetworkNode = {
  id: string;
  /** Neo4j label: Accused | FIR | Victim | Witness | Location | Vehicle | PhoneNumber | InvestigationOfficer */
  type: string;
  label: string;
};

export type NetworkEdge = {
  from: string;
  to: string;
  /** Relationship type, e.g. ACCUSED_IN, OWNS, OCCURRED_AT */
  type: string;
};

export type EntityNetwork = {
  entityId: string;
  entityLabel: string;
  depth: number;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  /** True when the neighborhood exceeded the server node cap (50). */
  truncated: boolean;
};
