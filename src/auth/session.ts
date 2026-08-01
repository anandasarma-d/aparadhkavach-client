import { parseAppViews, type AppRole, type AppView } from "../rbac/roleMatrix";

const STORAGE_KEY = "aparadhkavach.auth.session";
/** Set on Logout so LoginPage does not auto-mint from a lingering Catalyst cookie. */
const LOGOUT_PENDING_KEY = "aparadhkavach.auth.logoutPending";

export type AuthSession = {
  accessToken: string;
  role: AppRole;
  displayName: string;
  views: AppView[];
  homeView: string;
};

export function loadSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (!parsed.accessToken || !parsed.role) return null;
    const views = parseAppViews(parsed.views);
    if (views.length === 0) return null;
    return {
      accessToken: parsed.accessToken,
      role: parsed.role,
      displayName: parsed.displayName ?? parsed.role,
      views,
      homeView: parsed.homeView ?? views[0],
    };
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function markLogoutPending(): void {
  sessionStorage.setItem(LOGOUT_PENDING_KEY, "1");
}

export function clearLogoutPending(): void {
  sessionStorage.removeItem(LOGOUT_PENDING_KEY);
}

export function isLogoutPending(): boolean {
  return sessionStorage.getItem(LOGOUT_PENDING_KEY) === "1";
}

export function accessToken(): string | null {
  return loadSession()?.accessToken ?? null;
}
