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
  isUserAuthenticated: () => Promise<{ content?: boolean | CatalystUser } | boolean | CatalystUser>;
  getCurrentUser?: () => Promise<{ content?: CatalystUser } | CatalystUser>;
};

type CatalystUserManagement = {
  getCurrentProjectUser?: () => Promise<{ content?: CatalystUser } | CatalystUser>;
  getCurrentUser?: () => Promise<{ content?: CatalystUser } | CatalystUser>;
};

declare global {
  interface Window {
    catalyst?: {
      auth?: CatalystAuthApi & {
        userManagement?: CatalystUserManagement;
      };
      userManagement?: CatalystUserManagement;
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

function unwrapUser(result: unknown): CatalystUser | null {
  if (!result || typeof result !== "object") return null;
  if ("content" in result) {
    const content = (result as { content?: unknown }).content;
    if (!content || typeof content !== "object") return null;
    // isUserAuthenticated sometimes returns { content: true/false }
    if (!("email_id" in content || "email" in content || "user_id" in content || "userId" in content || "role_details" in content)) {
      return null;
    }
    return content as CatalystUser;
  }
  if ("email_id" in result || "email" in result || "user_id" in result || "role_details" in result) {
    return result as CatalystUser;
  }
  return null;
}

export async function isCatalystAuthenticated(): Promise<boolean> {
  const auth = window.catalyst?.auth;
  if (!auth?.isUserAuthenticated) return false;
  try {
    const result = await auth.isUserAuthenticated();
    if (typeof result === "boolean") return result;
    if (result && typeof result === "object" && "content" in result) {
      const content = (result as { content?: unknown }).content;
      if (typeof content === "boolean") return content;
      return Boolean(unwrapUser(result));
    }
    return Boolean(unwrapUser(result));
  } catch {
    return false;
  }
}

async function fetchCurrentUserRaw(): Promise<CatalystUser | null> {
  const cat = window.catalyst;
  if (!cat) return null;

  const attempts: Array<() => Promise<unknown>> = [];

  const um = cat.userManagement ?? cat.auth?.userManagement;
  if (um?.getCurrentProjectUser) {
    attempts.push(() => um.getCurrentProjectUser!());
  }
  if (um?.getCurrentUser) {
    attempts.push(() => um.getCurrentUser!());
  }
  if (cat.auth?.getCurrentUser) {
    attempts.push(() => cat.auth!.getCurrentUser!());
  }
  // Web SDK v4: isUserAuthenticated resolves to { content: <user> } when signed in.
  if (cat.auth?.isUserAuthenticated) {
    attempts.push(() => cat.auth!.isUserAuthenticated());
  }

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const user = unwrapUser(await attempt());
      if (user) return user;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    throw lastError instanceof Error
      ? lastError
      : new Error(`Catalyst getCurrentUser failed: ${String(lastError)}`);
  }
  return null;
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
      `Catalyst role "${String(roleRaw ?? "")}" cannot sign in here. In console → Users → Edit, set role to INVESTIGATOR / ANALYST / SUPERVISOR / POLICYMAKER (not App Administrator / App User), then reload.`,
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

/**
 * After Embedded password success Catalyst navigates the *iframe* to service_url.
 * Point at the public Slate host so a nest still breaks out to one known origin (D-081).
 */
export function startEmbeddedSignIn(elementId: string): void {
  const auth = window.catalyst?.auth;
  if (!auth?.signIn) {
    throw new Error("Catalyst Embedded Auth is not available on this host");
  }
  const host = document.getElementById(elementId);
  if (host) {
    host.replaceChildren();
  }
  auth.signIn(elementId, {
    // Public host — iframe may still load SPA; LoginPage breaks out of frames (D-081).
    service_url: `${appOrigin()}/`,
    // Do not set css_url — custom sheets replace Catalyst defaults and break panel show/hide.
    // Keep forgot password in the same iframe (a second host stacks Sign-In + Forgot UIs).
  });
}

/** Invite set-password links only — do not match every `/accounts/**` (logout uses those too). */
export function isCatalystConfirmPath(pathname = window.location.pathname): boolean {
  return pathname.toLowerCase().includes("/pconfirm");
}

export function isCatalystLogoutPath(pathname = window.location.pathname): boolean {
  return pathname.toLowerCase().includes("/accounts/logout");
}

/**
 * Hosted Auth Confirm Password UI is on `accounts.zohoportal.in`.
 * Slate SPA swallows `/accounts/.../pconfirm`, so bounce invite links to the portal.
 */
export function redirectInviteConfirmToPortal(): boolean {
  if (!isCatalystConfirmPath()) return false;
  if (window.location.hostname.toLowerCase().includes("zohoportal")) return false;

  const target = `https://accounts.zohoportal.in${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
  return true;
}

/** Prefer the public Slate host — Catalyst signOut may land on catalystappexecutor.in. */
export function appOrigin(): string {
  const host = window.location.hostname.toLowerCase();
  if (host.includes("onslate.in") || host.includes("localhost") || host === "127.0.0.1") {
    return window.location.origin;
  }
  // Lane B workbench Slate (logout must not loop on catalystappexecutor.in).
  return "https://aparadhkavach-wb.onslate.in";
}

export function loggedOutUrl(): string {
  return `${appOrigin()}/?loggedOut=1`;
}

/** Lane B workbench ZAID (init.js). Used for portal logout when SPA swallows executor /accounts/logout. */
export function resolveCatalystZaid(): string {
  try {
    const fromInit = (window as unknown as { catalyst?: { zaid?: string | number } }).catalyst
      ?.zaid;
    if (fromInit != null && String(fromInit).trim()) return String(fromInit).trim();
  } catch {
    // ignore
  }
  return "50044400287";
}

/**
 * Hosted portal logout — clears Catalyst cookies. Prefer this over SDK signOut, which lands on
 * executor `/accounts/logout` where our SPA swallows the page and cookies survive (D-084/D-086).
 */
export function portalLogoutUrl(redirectUrl = loggedOutUrl()): string {
  const params = new URLSearchParams({
    client_portal: "true",
    zaid: resolveCatalystZaid(),
    serviceurl: redirectUrl,
    servicename: "ZOHOCATALYST",
  });
  return `https://accounts.zohoportal.in/accounts/logout?${params.toString()}`;
}

/**
 * Catalyst `signOut(serviceurl)` lands on `…catalystappexecutor.in/accounts/logout?…`.
 * Slate SPA swallows that path — bounce to **accounts.zohoportal.in** so logout can finish.
 */
export function redirectCatalystLogoutPath(): boolean {
  if (!isCatalystLogoutPath()) return false;
  if (window.location.hostname.toLowerCase().includes("zohoportal")) return false;

  const target = `https://accounts.zohoportal.in${window.location.pathname}${window.location.search}${window.location.hash}`;
  const win = window.top ?? window;
  win.location.replace(target);
  return true;
}

/**
 * D-081: when Catalyst posts service_url into the Embedded iframe, our SPA remounts
 * inside the frame → nested logos. Promote to the top window; keep logout intent.
 */
export function breakOutOfAuthFrameIfNested(): boolean {
  if (window.self === window.top) return false;
  try {
    const top = window.top;
    if (!top) return false;
    const logout =
      sessionStorage.getItem("aparadhkavach.auth.logoutPending") === "1" ||
      new URLSearchParams(window.location.search).get("loggedOut") === "1";
    top.location.replace(logout ? loggedOutUrl() : `${appOrigin()}/`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Leftover top-level SPA on catalystappexecutor (not /accounts/*) → public host.
 * Preserve logout query / pending so we do not auto-mint.
 */
export function redirectExecutorShellToPublicHost(): boolean {
  const host = window.location.hostname.toLowerCase();
  if (!host.includes("catalystappexecutor")) return false;
  if (isCatalystConfirmPath() || isCatalystLogoutPath()) return false;
  if (window.location.pathname.startsWith("/__catalyst")) return false;

  const logout =
    sessionStorage.getItem("aparadhkavach.auth.logoutPending") === "1" ||
    new URLSearchParams(window.location.search).get("loggedOut") === "1";
  window.location.replace(logout ? loggedOutUrl() : `${appOrigin()}/`);
  return true;
}

const SIGNOUT_ATTEMPTED_KEY = "aparadhkavach.auth.signOutAttempted";

export function markSignOutAttempted(): void {
  sessionStorage.setItem(SIGNOUT_ATTEMPTED_KEY, "1");
}

export function clearSignOutAttempted(): void {
  sessionStorage.removeItem(SIGNOUT_ATTEMPTED_KEY);
}

export function wasSignOutAttempted(): boolean {
  return sessionStorage.getItem(SIGNOUT_ATTEMPTED_KEY) === "1";
}

/** Clear Catalyst session via portal logout (not executor SPA). */
export async function catalystSignOut(redirectUrl = loggedOutUrl()): Promise<void> {
  try {
    const win = window.top ?? window;
    win.location.replace(portalLogoutUrl(redirectUrl));
  } catch {
    window.location.replace(portalLogoutUrl(redirectUrl));
  }
}
