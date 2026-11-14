import { expect, test } from "@playwright/test";
import { ALLOWED_FEATURE_KEYS, buildLoginFeatures } from "../../src/lib/loginSignals";

test("features contain ONLY the allow-listed keys (privacy guard)", () => {
  const features = buildLoginFeatures(1000, 5432.7, 2);
  expect(Object.keys(features).sort()).toEqual([...ALLOWED_FEATURE_KEYS].sort());
  // Nothing that could carry typed content: every value is a number or the client tag.
  for (const v of Object.values(features)) expect(["number", "string"]).toContain(typeof v);
  expect(JSON.stringify(features)).not.toMatch(/password|key|char|text|value/i);
});

test("timing is rounded, non-negative, and attempt numbers start at 1", () => {
  expect(buildLoginFeatures(1000, 5432.7, 2)).toEqual({ ms_page_to_submit: 4433, attempt_number: 2, client: "web_login_v1" });
  // A clock that goes backwards must not produce a negative duration.
  expect(buildLoginFeatures(5000, 4000, 0).ms_page_to_submit).toBe(0);
  expect(buildLoginFeatures(5000, 4000, 0).attempt_number).toBe(1);
});
