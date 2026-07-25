import type { EntityNetwork } from "./entityNetworkTypes";
import { apiGatewayBaseUrl } from "./apiGatewayClient";

export type { EntityNetwork, NetworkEdge, NetworkNode } from "./entityNetworkTypes";

/** Server clamps depth to 1..2; keep the client honest about the same range. */
export const MIN_DEPTH = 1;
export const MAX_DEPTH = 2;

export class EntityNotFoundError extends Error {
  constructor(entityId: string) {
    super(`No graph entity for ${entityId}`);
    this.name = "EntityNotFoundError";
  }
}

export async function fetchEntityNetwork(
  entityId: string,
  depth: number = MIN_DEPTH,
  signal?: AbortSignal,
): Promise<EntityNetwork> {
  const id = entityId.trim();
  if (!id) {
    throw new Error("entityId is required");
  }
  const clamped = Math.min(Math.max(Math.round(depth), MIN_DEPTH), MAX_DEPTH);

  const base = apiGatewayBaseUrl();
  const url = `${base}/v1/entities/${encodeURIComponent(id)}/network?depth=${clamped}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (res.status === 404) {
    throw new EntityNotFoundError(id);
  }
  if (!res.ok) {
    throw new Error(`Could not load network for ${id} (${res.status}).`);
  }

  return (await res.json()) as EntityNetwork;
}
