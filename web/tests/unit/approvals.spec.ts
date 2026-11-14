import { expect, test } from "@playwright/test";
import {
  asApprovalRow,
  canDecide,
  isPastDeadline,
  nextDeadline,
  pendingApprovals,
  ringsAlarm,
  shownStatus,
  upsertApproval,
  type ApprovalRow,
} from "../../src/lib/approvals";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const PAST = "2026-11-14T11:59:00Z";
const FUTURE = "2026-11-14T12:01:00Z";

test("a pending row past its deadline shows as expired and loses its buttons", () => {
  const a = { status: "pending" as const, expires_at: PAST };
  expect(isPastDeadline(a, NOW)).toBe(true);
  expect(shownStatus(a, NOW)).toBe("expired");
  expect(canDecide(a, NOW)).toBe(false);
  // The deadline moment itself already counts as expired.
  expect(canDecide({ status: "pending", expires_at: "2026-11-14T12:00:00Z" }, NOW)).toBe(false);
});

test("a pending row stays live until its deadline, or without one", () => {
  expect(shownStatus({ status: "pending", expires_at: FUTURE }, NOW)).toBe("pending");
  expect(canDecide({ status: "pending", expires_at: FUTURE }, NOW)).toBe(true);
  expect(canDecide({ status: "pending" }, NOW)).toBe(true);
  expect(canDecide({ status: "pending", expires_at: null }, NOW)).toBe(true);
  // A deadline that doesn't parse never expires a row locally; the server decides.
  expect(shownStatus({ status: "pending", expires_at: "not-a-date" }, NOW)).toBe("pending");
});

test("the server's word always wins over the local clock", () => {
  expect(shownStatus({ status: "expired", expires_at: FUTURE }, NOW)).toBe("expired");
  expect(shownStatus({ status: "approved", expires_at: PAST }, NOW)).toBe("approved");
  expect(shownStatus({ status: "denied", expires_at: PAST }, NOW)).toBe("denied");
  expect(canDecide({ status: "approved", expires_at: FUTURE }, NOW)).toBe(false);
  expect(isPastDeadline({ status: "expired", expires_at: PAST }, NOW)).toBe(false);
});

test("nextDeadline picks the earliest future deadline among pending rows only", () => {
  expect(nextDeadline([], NOW)).toBeNull();
  expect(nextDeadline([{ status: "pending", expires_at: PAST }], NOW)).toBeNull();
  expect(nextDeadline([{ status: "pending", expires_at: null }, { status: "pending" }], NOW)).toBeNull();
  expect(
    nextDeadline(
      [
        { status: "pending", expires_at: "2026-11-14T12:05:00Z" },
        { status: "pending", expires_at: FUTURE },
        { status: "denied", expires_at: "2026-11-14T12:00:30Z" }, // decided: never re-checked
        { status: "pending", expires_at: "not-a-date" },
      ],
      NOW,
    ),
  ).toBe(Date.parse(FUTURE));
});

// ---------------------------------------------------------------------------------------
// Pending selection for the console's Approvals badge + banner (one shared subscription).
// ---------------------------------------------------------------------------------------

const row = (over: Partial<ApprovalRow>): ApprovalRow => ({
  id: "ap-1",
  created_at: "2026-11-14T11:50:00Z",
  incident_id: "inc-1",
  status: "pending",
  summary: "Lock j.smith's account?",
  decided_by: null,
  decided_at: null,
  expires_at: null,
  ...over,
});

test("pendingApprovals keeps only pending rows that are not past their deadline", () => {
  const rows = [
    row({ id: "live-no-deadline" }),
    row({ id: "live-future", expires_at: FUTURE }),
    row({ id: "past-deadline", expires_at: PAST }),
    row({ id: "decided", status: "approved" }),
    row({ id: "expired", status: "expired" }),
    row({ id: "denied", status: "denied", expires_at: FUTURE }),
  ];
  expect(pendingApprovals(rows, NOW).map((a) => a.id)).toEqual(["live-no-deadline", "live-future"]);
  expect(pendingApprovals([], NOW)).toEqual([]);
  // The count the badge shows is just the selection's length: same clock, same rows.
  expect(pendingApprovals(rows, NOW).length).toBe(2);
});

test("a pending row drops out of the selection the moment its deadline passes", () => {
  const rows = [row({ id: "a", expires_at: "2026-11-14T12:00:30Z" })];
  expect(pendingApprovals(rows, NOW).length).toBe(1);
  expect(pendingApprovals(rows, Date.parse("2026-11-14T12:00:30Z")).length).toBe(0);
});

test("asApprovalRow accepts a well-shaped row and rejects garbage", () => {
  const parsed = asApprovalRow({
    id: "ap-9",
    created_at: "2026-11-14T11:59:00Z",
    incident_id: "inc-9",
    status: "pending",
    summary: "Freeze the finance agent?",
    decided_by: null,
    decided_at: null,
    expires_at: "2026-11-14T12:05:00Z",
    kind: "containment",
  });
  expect(parsed).toEqual({
    id: "ap-9",
    created_at: "2026-11-14T11:59:00Z",
    incident_id: "inc-9",
    status: "pending",
    summary: "Freeze the finance agent?",
    decided_by: null,
    decided_at: null,
    expires_at: "2026-11-14T12:05:00Z",
    kind: "containment",
  });
  // A row without expires_at or kind still parses (both columns are structural, not contractual).
  expect(asApprovalRow({ id: "x", created_at: "2026-11-14T11:00:00Z", status: "pending", summary: "s" })?.expires_at).toBeNull();
  expect(asApprovalRow({ id: "x", created_at: "2026-11-14T11:00:00Z", status: "pending", summary: "s" })?.kind).toBeNull();
  expect(asApprovalRow(null)).toBeNull();
  expect(asApprovalRow("nope")).toBeNull();
  expect(asApprovalRow({ id: 7, status: "pending", summary: "s", created_at: "t" })).toBeNull();
});

test("only release requests skip the alarm; unknown kinds ring", () => {
  expect(ringsAlarm({ kind: "release" })).toBe(false);
  expect(ringsAlarm({ kind: "containment" })).toBe(true);
  expect(ringsAlarm({ kind: "false_positive" })).toBe(true);
  expect(ringsAlarm({ kind: null })).toBe(true); // rows from before the kind column
  expect(ringsAlarm({})).toBe(true);
  expect(ringsAlarm({ kind: "something_new" })).toBe(true); // when in doubt, ring
});

test("upsertApproval replaces by id and keeps newest first", () => {
  const a = row({ id: "a", created_at: "2026-11-14T11:00:00Z" });
  const b = row({ id: "b", created_at: "2026-11-14T11:30:00Z" });
  const list = upsertApproval(upsertApproval([], a), b);
  expect(list.map((r) => r.id)).toEqual(["b", "a"]);
  // An UPDATE for the same id replaces the row instead of duplicating it.
  const decided = upsertApproval(list, { ...b, status: "approved" });
  expect(decided.map((r) => r.id)).toEqual(["b", "a"]);
  expect(decided[0].status).toBe("approved");
});
