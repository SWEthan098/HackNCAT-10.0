import { expect, test } from "@playwright/test";
import { CONSOLE_SECTIONS, ROUTES, isConsoleSectionActive, isProtected } from "../../src/lib/routes";

const activeTabs = (pathname: string) => CONSOLE_SECTIONS.filter((s) => isConsoleSectionActive(pathname, s.href)).map((s) => s.label);

test("each console page marks exactly its own tab", () => {
  expect(activeTabs("/console")).toEqual(["Incidents"]);
  expect(activeTabs("/console/audience")).toEqual(["Audience view"]);
  expect(activeTabs("/console/audit")).toEqual(["Audit log"]);
});

test("an incident page belongs to the Incidents tab", () => {
  expect(activeTabs("/console/incidents/inc-demo")).toEqual(["Incidents"]);
});

test("paths outside the console, or that only share a prefix, mark no tab", () => {
  expect(activeTabs("/dashboard")).toEqual([]);
  expect(activeTabs("/console/auditors")).toEqual([]);
  expect(activeTabs("/console/incidents-archive")).toEqual([]);
});

test("every console section needs a signed-in user", () => {
  for (const section of CONSOLE_SECTIONS) expect(isProtected(section.href)).toBe(true);
  expect(isProtected(ROUTES.attack)).toBe(false);
});
