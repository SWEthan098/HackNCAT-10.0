// Single source of truth for app routes and which ones need a session.

export const ROUTES = {
  home: "/",
  login: "/login",
  signup: "/signup",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  authCallback: "/auth/callback",
  dashboard: "/dashboard",
  profile: "/dashboard/profile",
  system: "/dashboard/system",
  ai: "/dashboard/ai",
  // Kairos
  console: "/console",
  consoleAudience: "/console/audience", // projector view of audience attacks
  consoleAudit: "/console/audit",
  attack: "/attack", // PUBLIC: audience Attack Picker (QR code lands here)
  approve: "/approve",
  redteam: "/redteam",
} as const;

/** Defender Console sections, in tab order. */
export const CONSOLE_SECTIONS = [
  { href: ROUTES.console, label: "Incidents" },
  { href: ROUTES.consoleAudience, label: "Audience view" },
  { href: ROUTES.consoleAudit, label: "Audit log" },
] as const;

/** Whether `pathname` belongs to the console section at `href`. */
export function isConsoleSectionActive(pathname: string, href: string): boolean {
  // "Incidents" is the console home, so it must not match every /console/... path;
  // it owns /console itself and the incident pages under /console/incidents/.
  if (href === ROUTES.console) return pathname === href || pathname.startsWith(`${href}/incidents/`);
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Paths that require a signed-in user. The proxy redirects to /login otherwise. */
export const PROTECTED_PREFIXES = [ROUTES.dashboard, ROUTES.resetPassword, ROUTES.console, ROUTES.approve, ROUTES.redteam];

/** Paths a signed-in user is sent away from (to the dashboard). */
export const GUEST_ONLY = [ROUTES.login, ROUTES.signup, ROUTES.forgotPassword];

export function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isGuestOnly(pathname: string): boolean {
  return GUEST_ONLY.includes(pathname as (typeof GUEST_ONLY)[number]);
}

/**
 * Only allow same-origin relative paths as post-login destinations, to prevent open
 * redirects like ?next=https://evil.example or ?next=//evil.example.
 */
export function safeNextPath(next: string | null | undefined, fallback: string = ROUTES.dashboard): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

// ---------------------------------------------------------------------------------------
// Role split (requested by Miles): red_team accounts only get /redteam; everyone else gets
// /console, /approve and the rest, but not /redteam. Roles come from public.user_roles (each
// user can read only their own rows). This is a navigation layer: the data itself is still
// protected by RLS and by the API's own role checks.
// ---------------------------------------------------------------------------------------

export type Role = "approver" | "red_team" | "analyst";

/** Protected pages a red_team account may still open. */
const RED_TEAM_ALLOWED = [ROUTES.redteam, ROUTES.resetPassword];

const isUnder = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Where "home" is for this account: after login, and from guest-only pages. */
export function homeFor(roles: readonly string[]): string {
  return roles.includes("red_team") ? ROUTES.redteam : ROUTES.dashboard;
}

/** The page to send this account to instead, or null if it may open `pathname`. */
export function roleRedirect(pathname: string, roles: readonly string[]): string | null {
  if (roles.includes("red_team")) {
    if (isProtected(pathname) && !RED_TEAM_ALLOWED.some((p) => isUnder(pathname, p))) return ROUTES.redteam;
    return null;
  }
  if (isUnder(pathname, ROUTES.redteam)) return ROUTES.console;
  return null;
}

/** Same split for nav links: a link shows only if the page would open. */
export function canOpen(href: string, roles: readonly string[]): boolean {
  return roleRedirect(href, roles) === null;
}
