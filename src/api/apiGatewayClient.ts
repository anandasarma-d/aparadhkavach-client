import type { AccusedRiskProfile } from "./accusedRiskProfile";


import { accessToken } from "../auth/session";

/** JSON Accept + Bearer when a session exists (mvp2/10 required Gateway JWT). */
export function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  const token = accessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

/**
 * Browser talks to the API Gateway only (Design & Schema §3.2 / §6.1; C8).
 * - DEV: same-origin `/v1/...` via Vite proxy → Gateway (avoids localhost vs 127.0.0.1 CORS).
 * - PROD/Slate: absolute `VITE_API_GATEWAY_URL` (Gateway owns CORS).
 */
export function apiGatewayBaseUrl(): string {
  const configured = import.meta.env.VITE_API_GATEWAY_URL?.trim();
  if (!configured) {
    throw new Error(
      "VITE_API_GATEWAY_URL is not set — see .env.example. Refusing to fall back.",
    );
  }
  if (import.meta.env.DEV) {
    return "";
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
  const url = `${base}/v1/accusedPersons/${encodeURIComponent(id)}:riskProfile`;
  const res = await fetch(url, {
    headers: authHeaders(),
    signal,
  });

  if (res.status === 404) {
    throw new Error(`No risk profile for accusedId=${id}`);
  }
  if (!res.ok) {
    throw new Error(
      `Could not load risk profile for accusedId=${id} (${res.status}).`,
    );
  }

  return (await res.json()) as AccusedRiskProfile;
}
