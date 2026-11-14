import { expect, test } from "@playwright/test";
import { canDecide, isPastDeadline, nextDeadline, shownStatus } from "../../src/lib/approvals";

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
