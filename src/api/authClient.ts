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

async function postSession(body: Record<string, unknown>): Promise<AuthSession> {
  const base = apiGatewayBaseUrl();
  const res = await fetch(`${base}/v1/auth/sessions`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Session mint failed (${res.status})${text ? `: ${text}` : ""}`);
  }
  const payload = (await res.json()) as SessionResponse;
  if (!payload.accessToken) {
    throw new Error("Session mint returned no accessToken");
  }
  const views = parseAppViews(payload.views);
  if (views.length === 0) {
    throw new Error("Session mint returned no usable views");
  }
  return {
    accessToken: payload.accessToken,
    role: payload.role as AppRole,
    displayName: payload.displayName,
    views,
    homeView: payload.homeView,
  };
}

/**
 * Production exchange: Auth Service looks up Catalyst user by id and mints from the
 * server-side role (client-supplied role is ignored).
 */
export async function createCatalystSession(opts: {
  catalystUserId: string;
  email?: string;
}): Promise<AuthSession> {
  return postSession({
    catalystUserId: opts.catalystUserId,
    email: opts.email,
  });
}

/** Bootstrap / demo role picker — requires AUTH_ALLOW_DEV_MINT=true on Auth Service. */
export async function createBootstrapSession(
  role: AppRole,
  opts?: { sub?: string; displayName?: string },
): Promise<AuthSession> {
  return postSession({
    role,
    sub: opts?.sub,
    displayName: opts?.displayName,
  });
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
