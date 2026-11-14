import { expect, test } from "@playwright/test";
import { ROUTES, canOpen, homeFor, roleRedirect } from "../../src/lib/routes";

const RED = ["red_team"];
const NONE: string[] = [];
const APPROVER = ["approver"];

test("red_team accounts only get /redteam (and changing their password)", () => {
  expect(roleRedirect("/redteam", RED)).toBeNull();
  expect(roleRedirect("/redteam/runs", RED)).toBeNull();
  expect(roleRedirect("/reset-password", RED)).toBeNull();
  for (const p of ["/console", "/console/incidents/x", "/approve", "/console/audit"]) {
    expect(roleRedirect(p, RED)).toBe(ROUTES.redteam);
  }
});

test("everyone else gets /console and /approve but not /redteam", () => {
  for (const roles of [NONE, APPROVER, ["analyst"]]) {
    expect(roleRedirect("/console", roles)).toBeNull();
    expect(roleRedirect("/approve", roles)).toBeNull();
    expect(roleRedirect("/redteam", roles)).toBe(ROUTES.console);
    expect(roleRedirect("/redteam/anything", roles)).toBe(ROUTES.console);
  }
});

test("public pages stay open to everyone, and prefixes don't over-match", () => {
  expect(roleRedirect("/attack", RED)).toBeNull();
  expect(roleRedirect("/", RED)).toBeNull();
  expect(roleRedirect("/attack", NONE)).toBeNull();
  expect(roleRedirect("/redteamish", NONE)).toBeNull();
});

test("an account with red_team plus another role is still red-team only", () => {
  expect(roleRedirect("/console", ["approver", "red_team"])).toBe(ROUTES.redteam);
});

test("home and nav links follow the same split", () => {
  expect(homeFor(RED)).toBe(ROUTES.redteam);
  expect(homeFor(APPROVER)).toBe(ROUTES.approve);
  expect(homeFor(NONE)).toBe(ROUTES.console);
  expect(canOpen(ROUTES.redteam, NONE)).toBe(false);
  expect(canOpen(ROUTES.console, NONE)).toBe(true);
  expect(canOpen(ROUTES.console, RED)).toBe(false);
  expect(canOpen(ROUTES.redteam, RED)).toBe(true);
});
