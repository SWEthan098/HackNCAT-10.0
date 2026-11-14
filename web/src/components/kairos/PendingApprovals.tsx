"use client";

// OWNER: Jordan (P4). One shared answer to "is a containment request waiting?" for accounts
// that hold the approver role but still roam the console (approver+analyst). It feeds BOTH
// the Approvals link's badge in the console header and the pending-approval banner, off a
// single Supabase select + Realtime subscription (never two).
//
// RLS ("Approvers read approvals", supabase/migrations/20261114000000_kairos_core.sql)
// restricts this read to approver-role accounts — exactly the accounts this renders for.
// The count is always derived from real rows; a failed load means no badge and no banner,
// never a guessed number. Approval summaries come from the API's code templates, but they
// render as plain text regardless.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, ButtonLink, cn } from "@/components/ui";
import {
  APPROVAL_COLUMNS,
  asApprovalRow,
  nextDeadline,
  pendingApprovals,
  upsertApproval,
  type ApprovalRow,
} from "@/lib/approvals";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

/**
 * The approvals still waiting for a human (pending AND not past their deadline), live.
 * null while loading, after a failed load, or when `enabled` is false.
 */
export function usePendingApprovals(enabled: boolean): ApprovalRow[] | null {
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    let cancelled = false;

    supabase
      .from("approvals")
      .select(APPROVAL_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        // A failed load keeps rows at null: the link renders without a badge, no banner.
        if (cancelled || error || !data) return;
        const parsed = data.map(asApprovalRow).filter((a): a is ApprovalRow => a !== null);
        setRows((prev) => parsed.reduce(upsertApproval, prev ?? []));
      });

    const onRow = (payload: { new: unknown }) => {
      const row = asApprovalRow(payload.new);
      if (row && !cancelled) setRows((list) => upsertApproval(list ?? [], row));
    };
    const channel = supabase
      .channel("approvals-console")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "approvals" }, onRow)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "approvals" }, onRow)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  // Re-render exactly when the next pending deadline passes (same pattern as the phone), so
  // an expiring request drops out of the badge and banner without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const at = nextDeadline(rows ?? [], now);
    if (at === null) return;
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, at - Date.now()) + 250);
    return () => clearTimeout(t);
  }, [rows, now]);

  return useMemo(() => (rows === null ? null : pendingApprovals(rows, now)), [rows, now]);
}

/** "Approvals" link for the console top bar, with a count badge while requests wait. */
export function ApprovalsNavLink({ pending }: { pending: ApprovalRow[] | null }) {
  const count = pending?.length ?? 0;
  return (
    <Link
      href={ROUTES.approve}
      aria-label={count > 0 ? `Approvals, ${count} waiting` : "Approvals"}
      className={cn(
        "hidden h-12 shrink-0 items-center gap-1.5 px-2 text-[0.9375rem] no-underline sm:inline-flex",
        "transition-[color,background-color] focus-visible:-outline-offset-2 hover:bg-graphite-2/60 active:bg-graphite-2",
        count > 0 ? "font-medium text-graphite-ink" : "text-graphite-muted hover:text-graphite-ink",
      )}
    >
      Approvals
      {count > 0 && (
        <span
          aria-hidden="true"
          className="num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-error-fill px-1.5 font-mono text-xs font-semibold text-on-error-fill"
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/**
 * Prominent "an approval is waiting" banner for console pages (never shown on /approve —
 * this only mounts inside the console shell). Dismissible per pending request: dismissing
 * hides the requests waiting right now, and a NEW request brings the banner back. It clears
 * itself when every request is decided or expires (Realtime + the deadline clock above).
 */
export function PendingApprovalsBanner({ pending }: { pending: ApprovalRow[] | null }) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const waiting = (pending ?? []).filter((a) => !dismissed.has(a.id));
  if (waiting.length === 0) return null;
  return (
    <Alert
      tone="error"
      title={waiting.length === 1 ? "An approval is waiting for a human decision" : `${waiting.length} approvals are waiting for a human decision`}
      className="mb-4"
      action={
        <div className="flex items-center gap-2">
          <ButtonLink href={ROUTES.approve} size="sm">
            Open approvals
          </ButtonLink>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed((s) => new Set([...s, ...waiting.map((a) => a.id)]))}
          >
            Dismiss
          </Button>
        </div>
      }
    >
      <span className="line-clamp-2 whitespace-pre-line">{waiting[0].summary}</span>
    </Alert>
  );
}
