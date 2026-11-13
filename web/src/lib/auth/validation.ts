// Client-side auth validation and error mapping. Pure functions: unit-tested in
// tests/unit/validation.spec.ts. Server-side rules in Supabase still apply.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt ignores bytes beyond 72

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return "Enter your email address.";
  if (value.length > 254 || !EMAIL_RE.test(value)) return "Enter a valid email address, like name@example.com.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Enter a password.";
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Include at least one letter and one number.";
  return null;
}

export function validateConfirm(password: string, confirm: string): string | null {
  if (!confirm) return "Confirm your password.";
  return password === confirm ? null : "Passwords do not match.";
}

type AuthErrorLike = { code?: string; message?: string; status?: number } | null | undefined;

/** Map a Supabase auth error to a message for people, never leaking internals. */
export function authErrorMessage(error: AuthErrorLike): string {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();
  switch (code) {
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Log in instead.";
    case "email_not_confirmed":
      return "Confirm your email address first, then log in.";
    case "weak_password":
      return "That password is too weak. Use a longer one with letters and numbers.";
    case "same_password":
      return "Choose a password different from your current one.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Wait a minute and try again.";
    case "signup_disabled":
      return "New sign-ups are turned off for this project.";
    case "session_expired":
    case "session_not_found":
    case "refresh_token_not_found":
      return "Your session has expired. Log in again.";
  }
  if (message.includes("already registered")) return "An account with this email already exists. Log in instead.";
  if (message.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (error?.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (message.includes("fetch") || message.includes("network")) return "Can't reach the server. Check your connection.";
  return "Something went wrong. Try again.";
}

/**
 * With email confirmation ON, Supabase answers a sign-up for an existing email with a
 * fake user that has no identities (to avoid account enumeration) instead of an error.
 * With confirmation OFF it returns `user_already_exists`. Treat both as a duplicate.
 */
export function isDuplicateSignup(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return Boolean(user && Array.isArray(user.identities) && user.identities.length === 0);
}
