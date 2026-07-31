/**
 * Catalyst Web SDK helpers for Embedded Auth on Slate (mvp2/10).
 * Relies on /__catalyst/sdk/init.js (served by Catalyst) + catalystWebSDK CDN.
 */

import { type AppRole, BOOTSTRAP_ROLES } from "../rbac/roleMatrix";

const WEB_SDK_SRC = "https://static.zohocdn.com/catalyst/sdk/js/4.4.0/catalystWebSDK.js";
const INIT_SRC = "/__catalyst/sdk/init.js";

type CatalystUser = {
  user_id?: string | number;
  userId?: string | number;
  email_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role_details?: { role_name?: string; roleName?: string; name?: string };
  role_name?: string;
  roleName?: string;
};

type CatalystAuthApi = {
  signIn: (elementId: string, config?: Record<string, unknown>) => void;
  signOut: (redirectUrl?: string) => void;
  isUserAuthenticated: () => Promise<{ content?: boolean } | boolean>;
  getCurrentUser?: () => Promise<{ content?: CatalystUser } | CatalystUser>;
};

declare global {
  interface Window {
    catalyst?: {
      auth?: CatalystAuthApi & {
        userManagement?: {
          getCurrentUser: () => Promise<{ content?: CatalystUser } | CatalystUser>;
        };
      };
      initApp?: (cfg: unknown) => void;
    };
  }
}

let scriptsPromise: Promise<boolean> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

/** Load Web SDK + Slate init.js. Returns false if Catalyst client init is unavailable. */
export function ensureCatalystSdk(): Promise<boolean> {
  if (scriptsPromise) return scriptsPromise;
  scriptsPromise = (async () => {
    try {
      await loadScript(WEB_SDK_SRC);
      await loadScript(INIT_SRC);
      return typeof window.catalyst?.auth?.signIn === "function";
    } catch {
      return false;
    }
  })();
  return scriptsPromise;
}

export function catalystAvailable(): boolean {
  return typeof window.catalyst?.auth?.signIn === "function";
}

export async function isCatalystAuthenticated(): Promise<boolean> {
  const auth = window.catalyst?.auth;
  if (!auth?.isUserAuthenticated) return false;
  try {
    const result = await auth.isUserAuthenticated();
    if (typeof result === "boolean") return result;
    return Boolean(result?.content);
  } catch {
    return false;
  }
}

async function fetchCurrentUserRaw(): Promise<CatalystUser | null> {
  const auth = window.catalyst?.auth;
  if (!auth) return null;
  try {
    const viaUm = auth.userManagement?.getCurrentUser;
    const viaAuth = auth.getCurrentUser;
    const fn = viaUm ?? viaAuth;
    if (!fn) return null;
    const result = await fn.call(auth.userManagement ?? auth);
    if (result && typeof result === "object" && "content" in result) {
      return (result as { content?: CatalystUser }).content ?? null;
    }
    return (result as CatalystUser) ?? null;
  } catch {
    return null;
  }
}

export function mapCatalystRole(raw: unknown): AppRole | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, "_");
  if ((BOOTSTRAP_ROLES as readonly string[]).includes(normalized)) {
    return normalized as AppRole;
  }
  return null;
}

export type CatalystIdentity = {
  role: AppRole;
  sub: string;
  displayName: string;
  email?: string;
};

export async function readCatalystIdentity(): Promise<CatalystIdentity | null> {
  const user = await fetchCurrentUserRaw();
  if (!user) return null;

  const roleRaw =
    user.role_details?.role_name ??
    user.role_details?.roleName ??
    user.role_details?.name ??
    user.role_name ??
    user.roleName;
  const role = mapCatalystRole(roleRaw);
  if (!role) {
    throw new Error(
      `Catalyst user role "${String(roleRaw ?? "")}" is not one of INVESTIGATOR / ANALYST / SUPERVISOR / POLICYMAKER`,
    );
  }

  const sub = String(user.user_id ?? user.userId ?? user.email_id ?? user.email ?? "").trim();
  if (!sub) {
    throw new Error("Catalyst getCurrentUser returned no user id");
  }

  const first = (user.first_name ?? "").trim();
  const last = (user.last_name ?? "").trim();
  const displayName =
    [first, last].filter(Boolean).join(" ") ||
    (user.email_id ?? user.email ?? role);

  return {
    role,
    sub,
    displayName,
    email: user.email_id ?? user.email,
  };
}

/** Mount Embedded login iframe into #elementId (forgot-password uses #catalyst-forgot). */
export function startEmbeddedSignIn(elementId: string): void {
  const auth = window.catalyst?.auth;
  if (!auth?.signIn) {
    throw new Error("Catalyst Embedded Auth is not available on this host");
  }
  auth.signIn(elementId, {
    // After password login, reload this SPA so we can mint AparadhKavach JWT.
    service_url: `${window.location.origin}/`,
    // Render forgot / set-password UI in a dedicated host (avoids clipping inside the login iframe).
    is_customize_forgot_password: true,
    forgot_password_id: "catalyst-forgot",
  });
}

export function catalystSignOut(redirectUrl = "/"): void {
  try {
    window.catalyst?.auth?.signOut?.(redirectUrl);
  } catch {
    // ignore — JWT clear still happens in App
  }
}
