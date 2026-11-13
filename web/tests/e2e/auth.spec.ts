import { expect, test, type Page } from "@playwright/test";
import {
  adminConfigured,
  deleteTestUser,
  findUserByEmail,
  generateRecoveryActionLink,
  generateRecoveryTokenHash,
  getProfile,
} from "./supabase-admin";

// Full account lifecycle against the real Supabase project, in order. One uniquely named
// test user is created and deleted at the end (by exact id + email).
test.describe.configure({ mode: "serial" });
test.skip(!adminConfigured, "Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (api/.env) to manage the test user");

const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const EMAIL = `e2e-${stamp}@example.com`;
const PASSWORD = `Hack${stamp.replace(/-/g, "")}9`;
const NEW_PASSWORD = `Reset${stamp.replace(/-/g, "")}7`;
let userId: string | null = null;

async function login(page: Page, email: string, password: string) {
  await page.getByRole("textbox", { name: /^Email/ }).fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

test.afterAll(async () => {
  const user = userId ? { id: userId } : await findUserByEmail(EMAIL);
  if (user) await deleteTestUser(user.id, EMAIL);
  expect(await findUserByEmail(EMAIL)).toBeNull();
});

test("protected route redirects to /login when signed out", async ({ page }) => {
  await page.goto("/dashboard/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fprofile/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("registration validates email, password and confirmation", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("textbox", { name: /^Email/ }).fill("not-an-email");
  await page.locator("#signup-password").fill("short");
  await page.locator("#signup-confirm").fill("different");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
  await expect(page).toHaveURL(/\/signup/);
});

test("password visibility toggle", async ({ page }) => {
  await page.goto("/signup");
  const input = page.locator("#signup-password");
  await input.fill("secret123");
  await expect(input).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).first().click();
  await expect(input).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(input).toHaveAttribute("type", "password");
});

test("registration creates the account and its profile, then lands on the dashboard", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("textbox", { name: /^Email/ }).fill(EMAIL);
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-confirm").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("user-email")).toHaveText(EMAIL);

  const user = await findUserByEmail(EMAIL);
  expect(user, "user stored in Supabase Auth").not.toBeNull();
  expect(user!.email_confirmed_at, "auto-confirmed (email confirmation off)").not.toBeNull();
  userId = user!.id;
  expect(await getProfile(userId), "profile row created by trigger").not.toBeNull();
});

test("session survives refresh and a brand-new browser context", async ({ page, browser }) => {
  await page.goto("/login");
  await login(page, EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("user-email")).toHaveText(EMAIL);

  // Simulate closing and reopening the app: new context with the same cookies.
  const state = await page.context().storageState();
  const reopened = await browser.newContext({ storageState: state });
  const p2 = await reopened.newPage();
  await p2.goto("/dashboard");
  await expect(p2).toHaveURL(/\/dashboard$/);
  await expect(p2.getByTestId("user-email")).toHaveText(EMAIL);
  await reopened.close();
});

test("dashboard nav cards route to working pages, profile matches the user", async ({ page }) => {
  await page.goto("/login");
  await login(page, EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("link", { name: /Profile Your account details/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/profile$/);
  await expect(page.getByTestId("profile-email")).toHaveText(EMAIL);
  await expect(page.getByTestId("profile-id")).toHaveText(userId!);

  await page.getByRole("textbox", { name: "Display name" }).fill("E2E Tester");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Display name" })).toHaveValue("E2E Tester");

  await page.goto("/dashboard");
  await page.getByRole("link", { name: /System status/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/system$/);
  const authRow = page.getByRole("row", { name: /Session verified by API/ });
  await expect(authRow).toContainText("Pass");
  await expect(page.getByRole("row", { name: /Database/ })).toContainText("Pass");
  await expect(page.getByRole("row", { name: /AI provider/ })).toContainText("Pass");

  await page.goto("/dashboard");
  await page.getByRole("link", { name: /AI playground/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/ai$/);
  await expect(page.getByRole("heading", { name: "AI playground" })).toBeVisible();
  // Full path: browser -> API -> configured AI provider (Groq locally, mock in CI).
  await page.getByLabel("Message").fill("Reply with exactly: HackNCAT ready");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("ai-output")).toContainText("HackNCAT ready", { timeout: 45_000 });
  await expect(page.getByText("Input tokens")).toBeVisible();
});

test("signed-in users are sent from /login to the dashboard; logout ends the session", async ({ page }) => {
  await page.goto("/login");
  await login(page, EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);

  await logout(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
});

test("duplicate registration is rejected with a clear message", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("textbox", { name: /^Email/ }).fill(EMAIL.toUpperCase());
  await page.locator("#signup-password").fill(PASSWORD);
  await page.locator("#signup-confirm").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("An account with this email already exists.")).toBeVisible();
  await expect(page).toHaveURL(/\/signup/);
});

test("wrong password is rejected; correct credentials log in and honour ?next", async ({ page }) => {
  await page.goto("/login");
  await login(page, EMAIL, "WrongPassword1");
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();

  await page.goto("/login?next=%2Fdashboard%2Fsystem");
  await login(page, EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard\/system$/);
  await logout(page);
});

test("?next cannot redirect off-site", async ({ page }) => {
  await page.goto("/login?next=https%3A%2F%2Fevil.example");
  await login(page, EMAIL, PASSWORD);
  await expect(page).toHaveURL(/localhost:3000\/dashboard$/);
  await logout(page);
});

test("forgot-password form gives a neutral confirmation", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByRole("textbox", { name: /^Email/ }).fill(EMAIL);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
});

test("recovery link signs in, new password works, old one does not", async ({ page }) => {
  const tokenHash = await generateRecoveryTokenHash(EMAIL);
  await page.goto(`/auth/callback?token_hash=${tokenHash}&type=recovery`);
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.locator("#reset-password").fill(NEW_PASSWORD);
  await page.locator("#reset-confirm").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password updated")).toBeVisible();
  await page.getByRole("link", { name: "Go to dashboard" }).click();
  await logout(page);

  await login(page, EMAIL, PASSWORD);
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await login(page, EMAIL, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("dashboard-style (implicit flow) recovery email link lands on /reset-password", async ({ page, baseURL }) => {
  const { actionLink, redirectTo } = await generateRecoveryActionLink(EMAIL, `${baseURL}/`);
  console.log(`Supabase honoured redirect_to: ${redirectTo}`);
  await page.goto(actionLink);
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(page.url()).not.toContain("access_token");
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
});

test("an invalid or reused recovery link is rejected", async ({ page }) => {
  await page.goto("/auth/callback?token_hash=not-a-real-token&type=recovery");
  await expect(page).toHaveURL(/\/login\?error=link_invalid/);
  await expect(page.getByText("That link is invalid or has expired.")).toBeVisible();
});
