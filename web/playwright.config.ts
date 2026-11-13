import { defineConfig, devices } from "@playwright/test";

// Two projects:
//   unit  pure TypeScript tests (no browser, no servers) - runs in CI
//   e2e   real browser against the running web (:3000) and API (:8000) dev servers and the
//         real Supabase project. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from
//         api/.env locally) to create and then delete its own temporary test user.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// Locally use the installed Microsoft Edge (no browser download); in CI use bundled Chromium.
const channel = process.env.CI ? undefined : (process.env.PW_CHANNEL ?? "msedge");

export default defineConfig({
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  fullyParallel: false,
  workers: 1,
  projects: [
    { name: "unit", testDir: "./tests/unit" },
    {
      name: "e2e",
      testDir: "./tests/e2e",
      use: { ...devices["Desktop Chrome"], channel, baseURL, trace: "retain-on-failure" },
    },
  ],
});
