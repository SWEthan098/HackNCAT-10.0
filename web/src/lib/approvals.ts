// Pure expiry decisions for the approver's phone (/approve). No React, no browser: unit-testable.
// OWNER: Jordan (P4).
//
// The backend only flips a timed-out approval to "expired" lazily (when GET /stats runs), so a
// row can sit on the phone as "pending" with its deadline (expires_at) already past. These
// helpers decide what the UI shows and whether Approve/Deny are live: a past-deadline row reads
// as expired, never rings, and gets no live buttons. The server stays the authority on the real
// outcome — a tap that races the deadline gets a 404/409 and the UI explains that.

import type { ApprovalStatus } from "@/lib/types/kairos";

/** The fields expiry decisions need (the phone's ApprovalRow satisfies this). */
export type ApprovalLike = { status: ApprovalStatus; expires_at?: string | null };

/** True when the server still says "pending" but the row's deadline has passed. */
export function isPastDeadline(a: ApprovalLike, nowMs: number): boolean {
  if (a.status !== "pending" || !a.expires_at) return false;
  const at = Date.parse(a.expires_at);
  // A deadline that doesn't parse never expires a row locally; the server decides.
  return Number.isFinite(at) && at <= nowMs;
}

/** The status the phone shows: "expired" when the server says so OR the deadline has passed. */
export function shownStatus(a: ApprovalLike, nowMs: number): ApprovalStatus {
  return isPastDeadline(a, nowMs) ? "expired" : a.status;
}

/** Approve/Deny are live only while the request still shows as pending. */
export function canDecide(a: ApprovalLike, nowMs: number): boolean {
  return shownStatus(a, nowMs) === "pending";
}

/** The earliest future deadline (ms since epoch) among pending rows, or null — when to re-check. */
export function nextDeadline(rows: readonly ApprovalLike[], nowMs: number): number | null {
  let next: number | null = null;
  for (const a of rows) {
    if (a.status !== "pending" || !a.expires_at) continue;
    const at = Date.parse(a.expires_at);
    if (!Number.isFinite(at) || at <= nowMs) continue;
    if (next === null || at < next) next = at;
  }
  return next;
}
