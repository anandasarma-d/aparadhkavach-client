/**
 * Catalyst Web SDK helpers for Embedded Auth on Slate (mvp2/10).
 * Relies on /__catalyst/sdk/init.js (served by Catalyst) + catalystWebSDK CDN.
 */

import { type AppRole, BOOTSTRAP_ROLES } from "../rbac/roleMatrix";

const WEB_SDK_SRC = "https://static.zohocdn.com/catalyst/sdk/js/4.4.0/catalystWebSDK.js";
const INIT_SRC = "/__catalyst/sdk/init.js";

export type CatalystUser = {
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


/** Fire-and-forget AppSail warm so Hosted return mint hits a hot Auth/Gateway (D-085). */
export function warmAuthServices(): void {
  const gw = (import.meta.env.VITE_API_GATEWAY_URL ?? "").replace(/\/$/, "");
  const targets = [
    gw ? `${gw}/health` : "/health",
    // Direct Auth health — no-cors still opens the AppSail (browser may opaque-fail).
    "https://auth-service-50044400287.development.catalystappsail.in/health",
  ];
  for (const url of targets) {
    try {
      void fetch(url, { mode: "no-cors", cache: "no-store" }).catch(() => undefined);
    } catch {
      // ignore
    }
  }
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
  const state = await readCatalystAuthState();
  return state.authenticated;
}

/**
 * One SDK round-trip: auth flag + optional user payload (Web SDK v4 often returns the user
 * inside isUserAuthenticated). Prefer this over isAuthenticated + separate profile fetch (D-085).
 */
export async function readCatalystAuthState(): Promise<{
  authenticated: boolean;
  user: CatalystUser | null;
}> {
  const auth = window.catalyst?.auth;
  if (!auth?.isUserAuthenticated) return { authenticated: false, user: null };
  try {
    const result = await auth.isUserAuthenticated();
    if (typeof result === "boolean") {
      return { authenticated: result, user: null };
    }
    if (result && typeof result === "object" && "content" in result) {
      const content = (result as { content?: unknown }).content;
      if (typeof content === "boolean") {
        return { authenticated: content, user: null };
      }
      const user = unwrapUser(result);
      return { authenticated: Boolean(user) || content != null, user };
    }
    const user = unwrapUser(result);
    return { authenticated: Boolean(user), user };
  } catch {
    return { authenticated: false, user: null };
  }
}

async function fetchCurrentUserRaw(
  preferred: CatalystUser | null = null,
): Promise<CatalystUser | null> {
  if (preferred) return preferred;

  const cat = window.catalyst;
  if (!cat) return null;

  // Prefer isUserAuthenticated first — often already has the user (avoids extra RPCs on mint).
  const attempts: Array<() => Promise<unknown>> = [];
  if (cat.auth?.isUserAuthenticated) {
    attempts.push(() => cat.auth!.isUserAuthenticated());
  }
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

export async function readCatalystIdentity(
  preferredUser: CatalystUser | null = null,
): Promise<CatalystIdentity | null> {
  const user = await fetchCurrentUserRaw(preferredUser);
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
  const p = pathname.toLowerCase();
  // Both `/accounts/logout` and Hosted IAM `/accounts/p/{zaid}/logout` (D-099).
  return p.includes("/accounts/logout") || /\/accounts\/p\/[^/]+\/logout\/?$/.test(p);
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

/** Post-logout land with Switch intent — open Hosted once Catalyst cookie is gone (D-099). */
export function switchAccountLandingUrl(): string {
  return `${appOrigin()}/?loggedOut=1&switch=1`;
}

/** After portal logout, land here to open Embedded — never auto-mint (D-086/D-087). */
export function showLoginUrl(): string {
  return `${appOrigin()}/?showLogin=1`;
}

/**
 * Catalyst Hosted Auth login (platform page under /__catalyst — not our SPA).
 * Primary sign-in path after D-075/D-088 (Embedded iframe abandoned for demos).
 *
 * serviceurl includes {@code authReturn=1} so LoginPage can tell a Hosted success
 * bounce from a post-logout SPA land that still has logoutPending (D-101).
 */
export function hostedAuthLoginUrl(): string {
  const serviceurl = `${appOrigin()}/?authReturn=1`;
  const params = new URLSearchParams({ serviceurl });
  return `${appOrigin()}/__catalyst/auth/login?${params.toString()}`;
}

/** True when Catalyst Hosted finished and redirected back to the SPA (D-101). */
export function consumeAuthReturnQuery(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get("authReturn") !== "1") return false;
  params.delete("authReturn");
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", next || "/");
  return true;
}

export function consumeShowLoginQuery(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get("showLogin") !== "1") return false;
  params.delete("showLogin");
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", next || "/");
  return true;
}

/** True when URL asked to open Hosted after a clean logout (D-099). */
export function consumeSwitchQuery(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get("switch") !== "1") return false;
  params.delete("switch");
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", next || "/");
  return true;
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
 * Hosted IAM portal-user logout (same family as Forgot Password / signin iframe).
 * With Path=/accounts `CAUTH` cookie this returns a real 302 to `serviceurl` (not SPA).
 * Without CAUTH, Slate serves the SPA — seed CAUTH first via {@link seedCatalystAccountsCauth}.
 */
export function portalUserLogoutUrl(redirectUrl = loggedOutUrl()): string {
  const zaid = resolveCatalystZaid();
  const params = new URLSearchParams({
    servicename: "ZohoCatalyst",
    serviceurl: redirectUrl,
  });
  return `${appOrigin()}/accounts/p/${encodeURIComponent(zaid)}/logout?${params.toString()}`;
}

/**
 * Seed `CAUTH=true; Path=/accounts` so `/accounts/p/{zaid}/*` is handled by IAM, not the SPA.
 * Same cookie Forgot Password / Hosted iframes rely on (D-099).
 */
export async function seedCatalystAccountsCauth(): Promise<void> {
  const zaid = resolveCatalystZaid();
  const seed = `${appOrigin()}/accounts/p/${encodeURIComponent(zaid)}/password?servicename=ZohoCatalyst&serviceurl=${encodeURIComponent(`${appOrigin()}/`)}`;
  try {
    await fetch(seed, { credentials: "include", redirect: "manual", cache: "no-store" });
  } catch {
    // Navigation fallback still attempted by caller.
  }
}

/**
 * SDK `constructSignOutUrl` equivalent: `{origin}/baas/logout?logout=true&PROJECT_ID={zaid}&serviceurl=…`
 * Prefer {@link portalUserLogoutUrl} after CAUTH seed (D-099).
 */
export function baasLogoutUrl(redirectUrl = loggedOutUrl()): string {
  const params = new URLSearchParams({
    logout: "true",
    PROJECT_ID: resolveCatalystZaid(),
    serviceurl: redirectUrl,
  });
  return `${appOrigin()}/baas/logout?${params.toString()}`;
}

/**
 * Lane B Nimbus host whose name matches Catalyst’s `_iamadt_client_*` Set-Cookie Domain.
 * `/accounts/logout` on onslate.in emits the same clear with Domain=nimbuspop — browsers ignore it
 * (host mismatch). Executor often emits no clear. Nimbus host is the path that actually clears (D-099).
 */
export const LANE_B_NIMBUS_ORIGIN = "https://slate-6487000000004048-in.nimbuspop.com";

export function resolveNimbusOrigin(): string {
  try {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith(".nimbuspop.com") && host.startsWith("slate-")) {
      return `${window.location.protocol}//${window.location.host}`;
    }
  } catch {
    // ignore
  }
  return LANE_B_NIMBUS_ORIGIN;
}

/**
 * Same-origin-to-Nimbus logout. Response Set-Cookie clears `_iamadt_client_{zaid}` when Domain matches.
 * SPA then bounces to accounts.zohoportal.in (index.html / redirectCatalystLogoutPath).
 */
export function nimbusAccountsLogoutUrl(redirectUrl = loggedOutUrl()): string {
  const params = new URLSearchParams({
    client_portal: "true",
    zaid: resolveCatalystZaid(),
    serviceurl: redirectUrl,
    servicename: "ZOHOCATALYST",
  });
  return `${resolveNimbusOrigin()}/accounts/logout?${params.toString()}`;
}

/**
 * Zoho portal logout. Prefer `/accounts/p/{zaid}/logout` (matches Hosted portal paths);
 * keep client_portal form as fallback used by Catalyst baas/logout redirects.
 */
export function portalLogoutUrl(redirectUrl = loggedOutUrl()): string {
  const zaid = resolveCatalystZaid();
  const params = new URLSearchParams({ serviceurl: redirectUrl });
  return `https://accounts.zohoportal.in/accounts/p/${encodeURIComponent(zaid)}/logout?${params.toString()}`;
}

/** Same query shape Catalyst baas/logout 302s to (executor → portal bounce). */
export function portalClientLogoutUrl(redirectUrl = loggedOutUrl()): string {
  const params = new URLSearchParams({
    client_portal: "true",
    zaid: resolveCatalystZaid(),
    serviceurl: redirectUrl,
    servicename: "ZOHOCATALYST",
  });
  return `https://accounts.zohoportal.in/accounts/logout?${params.toString()}`;
}

/** Best-effort clear of non-HttpOnly auth crumbs the Web SDK also clears on AppSail signOut. */
export function clearClientVisibleAuthCookies(): void {
  const expire = "Thu, 01 Jan 1970 00:00:01 GMT";
  for (const name of ["CAUTH", "ZC_NEW_USER", "isalreadymember"]) {
    document.cookie = `${name}=; path=/; expires=${expire}`;
    document.cookie = `${name}=; path=/accounts; expires=${expire}`;
  }
}

/**
 * `/accounts/logout` and `/accounts/p/{zaid}/logout` may be swallowed by the Slate SPA.
 *
 * - Portal-user logout without CAUTH → seed CAUTH and reload once (IAM then 302s).
 * - On **nimbuspop**: cookie Domain matches → then bounce to portal.
 * - On **onslate / executor** `/accounts/logout`: upgrade to Nimbus first.
 */
export function redirectCatalystLogoutPath(): boolean {
  if (!isCatalystLogoutPath()) return false;
  const host = window.location.hostname.toLowerCase();
  if (host.includes("zohoportal")) return false;

  const path = window.location.pathname;
  const pathAndQuery = `${path}${window.location.search}${window.location.hash}`;
  const win = window.top ?? window;

  // Hosted IAM path served as SPA → seed CAUTH and retry (Forgot Password pattern, D-099).
  if (/\/accounts\/p\/[^/]+\/logout\/?$/i.test(path)) {
    const key = "aparadhkavach.auth.cauthSeedRetry";
    if (sessionStorage.getItem(key) !== "1") {
      sessionStorage.setItem(key, "1");
      void seedCatalystAccountsCauth().then(() => {
        win.location.reload();
      });
      return true;
    }
    sessionStorage.removeItem(key);
  }

  if (!host.includes("nimbuspop.com")) {
    win.location.replace(`${resolveNimbusOrigin()}${pathAndQuery}`);
    return true;
  }

  win.location.replace(`https://accounts.zohoportal.in${pathAndQuery}`);
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
    const showLogin = new URLSearchParams(window.location.search).get("showLogin") === "1";
    top.location.replace(
      logout ? loggedOutUrl() : showLogin ? showLoginUrl() : `${appOrigin()}/`,
    );
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
  const showLogin = new URLSearchParams(window.location.search).get("showLogin") === "1";
  window.location.replace(
    logout ? loggedOutUrl() : showLogin ? showLoginUrl() : `${appOrigin()}/`,
  );
  return true;
}

const SIGNOUT_ATTEMPTED_KEY = "aparadhkavach.auth.signOutAttempted";
const LOGOUT_COOKIE_RETRY_KEY = "aparadhkavach.auth.logoutCookieRetry";
const SWITCH_PENDING_KEY = "aparadhkavach.auth.switchPending";

export function markSignOutAttempted(): void {
  sessionStorage.setItem(SIGNOUT_ATTEMPTED_KEY, "1");
}

export function clearSignOutAttempted(): void {
  sessionStorage.removeItem(SIGNOUT_ATTEMPTED_KEY);
}

export function wasSignOutAttempted(): boolean {
  return sessionStorage.getItem(SIGNOUT_ATTEMPTED_KEY) === "1";
}

export function markSwitchPending(): void {
  sessionStorage.setItem(SWITCH_PENDING_KEY, "1");
}

export function clearSwitchPending(): void {
  sessionStorage.removeItem(SWITCH_PENDING_KEY);
}

export function isSwitchPending(): boolean {
  return sessionStorage.getItem(SWITCH_PENDING_KEY) === "1";
}

export function getLogoutCookieRetry(): number {
  const n = Number(sessionStorage.getItem(LOGOUT_COOKIE_RETRY_KEY) ?? "0");
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function bumpLogoutCookieRetry(): number {
  const next = getLogoutCookieRetry() + 1;
  sessionStorage.setItem(LOGOUT_COOKIE_RETRY_KEY, String(next));
  return next;
}

export function clearLogoutCookieRetry(): void {
  sessionStorage.removeItem(LOGOUT_COOKIE_RETRY_KEY);
}

/**
 * Clear Catalyst session (D-099).
 *
 * Forgot Password → “Terminate all sessions” works because Hosted IAM runs under
 * `/accounts/p/{zaid}/…` with a `CAUTH` cookie. Without CAUTH, Slate serves our SPA instead.
 *
 * Flow: seed CAUTH (silent fetch to `/accounts/p/{zaid}/password`) → top-level navigate to
 * `/accounts/p/{zaid}/logout?servicename=ZohoCatalyst&serviceurl=…` (real IAM 302).
 * Fallback: Nimbus `/accounts/logout` if SPA still swallows after 1.5s.
 */
export async function catalystSignOut(redirectUrl = loggedOutUrl()): Promise<void> {
  markSignOutAttempted();
  clearClientVisibleAuthCookies();
  sessionStorage.removeItem("aparadhkavach.auth.cauthSeedRetry");

  await seedCatalystAccountsCauth();

  const target = portalUserLogoutUrl(redirectUrl);
  try {
    (window.top ?? window).location.assign(target);
  } catch {
    window.location.assign(target);
  }

  window.setTimeout(() => {
    try {
      const p = window.location.pathname.toLowerCase();
      if (!p.includes("logout")) return;
      (window.top ?? window).location.replace(nimbusAccountsLogoutUrl(redirectUrl));
    } catch {
      // ignore
    }
  }, 1500);
}
