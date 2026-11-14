// Pure approval-row logic shared by the approver's phone (/approve) and the console's
// Approvals badge/banner. No React, no browser: unit-testable. OWNER: Jordan (P4).
//
// The backend only flips a timed-out approval to "expired" lazily (when GET /stats runs), so a
// row can sit on the phone as "pending" with its deadline (expires_at) already past. These
// helpers decide what the UI shows and whether Approve/Deny are live: a past-deadline row reads
// as expired, never rings, and gets no live buttons. The server stays the authority on the real
// outcome — a tap that races the deadline gets a 404/409 and the UI explains that.

import type { Approval, ApprovalStatus } from "@/lib/types/kairos";

/** The fields expiry decisions need (ApprovalRow satisfies this). */
export type ApprovalLike = { status: ApprovalStatus; expires_at?: string | null };

/** An approvals table row. expires_at is extra (structural: the frozen Approval type stays untouched). */
export type ApprovalRow = Approval & { expires_at?: string | null };

/** Columns the phone and the console badge select from public.approvals. */
export const APPROVAL_COLUMNS = "id, created_at, incident_id, status, summary, decided_by, decided_at, expires_at";

/** Shape check for rows arriving from a select or over Realtime. */
export function asApprovalRow(row: unknown): ApprovalRow | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.status !== "string" || typeof r.summary !== "string" || typeof r.created_at !== "string") {
    return null;
  }
  return {
    id: r.id,
    created_at: r.created_at,
    incident_id: typeof r.incident_id === "string" ? r.incident_id : "",
    status: r.status as Approval["status"],
    summary: r.summary,
    decided_by: typeof r.decided_by === "string" ? r.decided_by : null,
    decided_at: typeof r.decided_at === "string" ? r.decided_at : null,
    expires_at: typeof r.expires_at === "string" ? r.expires_at : null,
  };
}

/** Insert or replace by id (Realtime INSERT/UPDATE both land here), newest first. */
export function upsertApproval(list: ApprovalRow[], row: ApprovalRow): ApprovalRow[] {
  const rest = list.filter((a) => a.id !== row.id);
  return [row, ...rest].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

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

/**
 * The rows an approver still needs to act on: pending AND not past their deadline. Feeds the
 * console's Approvals badge and the pending-approval banner; the count is always derived from
 * real rows, never incremented locally.
 */
export function pendingApprovals<T extends ApprovalLike>(rows: readonly T[], nowMs: number): T[] {
  return rows.filter((a) => canDecide(a, nowMs));
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
