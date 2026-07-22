import type { AccusedRiskProfile } from "./accusedRiskProfile";

/**
 * Dev-only same-origin prefix. Vite proxies this to VITE_INVESTIGATION_SERVICE_URL so
 * browser calls avoid CORS against local Investigation Service (no CorsConfig there —
 * CORS lives on the API Gateway only).
 */
const DEV_PROXY_PREFIX = "/__ak_investigation";

export function investigationServiceBaseUrl(): string {
  const configured = import.meta.env.VITE_INVESTIGATION_SERVICE_URL?.trim();
  if (!configured) {
    throw new Error(
      "VITE_INVESTIGATION_SERVICE_URL is not set — see .env.example. Refusing to fall back.",
    );
  }
  const base = configured.replace(/\/$/, "");
  if (import.meta.env.DEV && isLocalHostUrl(base)) {
    return DEV_PROXY_PREFIX;
  }
  return base;
}

function isLocalHostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export async function fetchAccusedRiskProfile(
  accusedId: string,
  signal?: AbortSignal,
): Promise<AccusedRiskProfile> {
  const id = accusedId.trim();
  if (!id) {
    throw new Error("accusedId is required");
  }

  const base = investigationServiceBaseUrl();
  const res = await fetch(`${base}/v1/accusedPersons/${encodeURIComponent(id)}:riskProfile`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (res.status === 404) {
    throw new Error(`No risk profile for accusedId=${id}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Risk profile request failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }

  return (await res.json()) as AccusedRiskProfile;
}
