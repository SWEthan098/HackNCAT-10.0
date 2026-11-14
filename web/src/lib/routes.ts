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
