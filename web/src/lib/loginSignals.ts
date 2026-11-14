// Login Guard signals from the login page (checklist step 5). OWNER: Jordan (P4).
//
// PRIVACY RULE (docs/PLAN.md § 4, § 9): coarse, form-level timing and metadata ONLY.
// This module never reads field contents, never listens to keyboard events, and sends
// nothing about the password. The only identifying value is the account email the
// attempt is for (the Login Guard needs to know which account is under attack). The
// backend deletes raw signal data after 24 hours and keeps only scores.
//
// The allow-list below is enforced by a unit test: a feature key that is not listed
// here fails the build's tests, so extra data can't creep in unnoticed.

import { apiFetch } from "@/lib/api";
import type { SensorResponse } from "@/lib/types/kairos";

/** Every key the login page may ever send. Anything else is a bug. */
export const ALLOWED_FEATURE_KEYS = [
  "ms_page_to_submit", // how long the page was open before this submit
  "attempt_number", // 1st, 2nd, ... submit in this page view
  "client", // which collector built this payload
] as const;

export type LoginFeatures = {
  ms_page_to_submit: number;
  attempt_number: number;
  client: "web_login_v1";
};

/** Build the features for one submit. `pageLoadedAt`/`now` are performance.now() values. */
export function buildLoginFeatures(pageLoadedAt: number, now: number, attemptNumber: number): LoginFeatures {
  return {
    ms_page_to_submit: Math.max(0, Math.round(now - pageLoadedAt)),
    attempt_number: Math.max(1, Math.floor(attemptNumber)),
    client: "web_login_v1",
  };
}

/**
 * Fire-and-forget: the sensor must never slow down or break logging in, so all errors
 * are swallowed. POST /sensors/login is public (it runs before a session exists).
 */
export async function sendLoginSignal(username: string, features: LoginFeatures): Promise<void> {
  try {
    await apiFetch<SensorResponse>("/sensors/login", { method: "POST", body: { username, features } });
  } catch {
    // Losing a signal is acceptable; losing the login is not.
  }
}
