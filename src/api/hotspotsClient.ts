import type { HotspotsPage } from "./hotspotTypes";
import { apiGatewayBaseUrl } from "./apiGatewayClient";

export type { HotspotRow, HotspotsPage } from "./hotspotTypes";

export async function fetchHotspots(
  limit = 100,
  pageToken?: string,
  signal?: AbortSignal,
): Promise<HotspotsPage> {
  const base = apiGatewayBaseUrl();
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (pageToken) params.set("pageToken", pageToken);

  const url = `${base}/v1/analytics/hotspots?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Hotspots request failed: ${res.status} ${res.statusText} (GET ${url})${text ? ` — ${text}` : ""}`,
    );
  }

  return (await res.json()) as HotspotsPage;
}
