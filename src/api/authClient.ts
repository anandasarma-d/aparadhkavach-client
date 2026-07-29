import { apiGatewayBaseUrl } from "./apiGatewayClient";
import type { AuthSession } from "../auth/session";
import { parseAppViews, type AppRole } from "../rbac/roleMatrix";

type SessionResponse = {
  accessToken?: string;
  role: string;
  displayName: string;
  views: string[];
  homeView: string;
};

/** Bootstrap mint via AUTH_ALLOW_DEV_MINT on Auth Service (until Embedded exchange). */
export async function createBootstrapSession(role: AppRole): Promise<AuthSession> {
  const base = apiGatewayBaseUrl();
  const res = await fetch(`${base}/v1/auth/sessions`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Session mint failed (${res.status})${text ? `: ${text}` : ""}`);
  }
  const body = (await res.json()) as SessionResponse;
  if (!body.accessToken) {
    throw new Error("Session mint returned no accessToken");
  }
  const views = parseAppViews(body.views);
  if (views.length === 0) {
    throw new Error("Session mint returned no usable views");
  }
  return {
    accessToken: body.accessToken,
    role: body.role as AppRole,
    displayName: body.displayName,
    views,
    homeView: body.homeView,
  };
}

export async function revokeSession(token: string): Promise<void> {
  const base = apiGatewayBaseUrl();
  await fetch(`${base}/v1/auth/sessions:revoke`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => undefined);
}
