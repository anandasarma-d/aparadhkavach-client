import type { AccusedRiskProfile } from "./accusedRiskProfile";

/**
 * Browser talks to the API Gateway only (Design & Schema §3.2 / §6.1; C8).
 * CORS is owned by the Gateway — do not point this client at Investigation/Analytics.
 */
export function apiGatewayBaseUrl(): string {
  const configured = import.meta.env.VITE_API_GATEWAY_URL?.trim();
  if (!configured) {
    throw new Error(
      "VITE_API_GATEWAY_URL is not set — see .env.example. Refusing to fall back.",
    );
  }
  return configured.replace(/\/$/, "");
}

export async function fetchAccusedRiskProfile(
  accusedId: string,
  signal?: AbortSignal,
): Promise<AccusedRiskProfile> {
  const id = accusedId.trim();
  if (!id) {
    throw new Error("accusedId is required");
  }

  const base = apiGatewayBaseUrl();
  const res = await fetch(`${base}/v1/accusedPersons/${encodeURIComponent(id)}:riskProfile`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (res.status === 404) {
    throw new Error(`No risk profile for accusedId=${id}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Risk profile request failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`,
    );
  }

  return (await res.json()) as AccusedRiskProfile;
}
