import { expect, test } from "@playwright/test";
import {
  authErrorMessage,
  isDuplicateSignup,
  normalizeEmail,
  validateConfirm,
  validateEmail,
  validatePassword,
} from "../../src/lib/auth/validation";
import { isGuestOnly, isProtected, safeNextPath } from "../../src/lib/routes";

test("validateEmail", () => {
  expect(validateEmail("")).toMatch(/Enter your email/);
  expect(validateEmail("nope")).toMatch(/valid email/);
  expect(validateEmail("a@b")).toMatch(/valid email/);
  expect(validateEmail(" person@example.com ")).toBeNull();
});

test("normalizeEmail trims and lowercases", () => {
  expect(normalizeEmail("  Cole@Example.COM ")).toBe("cole@example.com");
});

test("validatePassword", () => {
  expect(validatePassword("")).toMatch(/Enter a password/);
  expect(validatePassword("abc12")).toMatch(/at least 8/);
  expect(validatePassword("abcdefgh")).toMatch(/letter and one number/);
  expect(validatePassword("12345678")).toMatch(/letter and one number/);
  expect(validatePassword("a".repeat(72) + "1")).toMatch(/at most 72/);
  expect(validatePassword("hackncat10")).toBeNull();
});

test("validateConfirm", () => {
  expect(validateConfirm("hackncat10", "")).toMatch(/Confirm/);
  expect(validateConfirm("hackncat10", "hackncat11")).toBe("Passwords do not match.");
  expect(validateConfirm("hackncat10", "hackncat10")).toBeNull();
});

test("authErrorMessage maps Supabase codes without leaking internals", () => {
  expect(authErrorMessage({ code: "invalid_credentials" })).toBe("Email or password is incorrect.");
  expect(authErrorMessage({ code: "user_already_exists" })).toMatch(/already exists/);
  expect(authErrorMessage({ message: "User already registered" })).toMatch(/already exists/);
  expect(authErrorMessage({ status: 429 })).toMatch(/Too many attempts/);
  expect(authErrorMessage({ message: "pg error: relation x does not exist" })).toBe("Something went wrong. Try again.");
});

test("isDuplicateSignup detects the obfuscated duplicate user", () => {
  expect(isDuplicateSignup({ identities: [] })).toBe(true);
  expect(isDuplicateSignup({ identities: [{}] })).toBe(false);
  expect(isDuplicateSignup(null)).toBe(false);
});

test("safeNextPath blocks open redirects", () => {
  expect(safeNextPath("/dashboard/profile")).toBe("/dashboard/profile");
  expect(safeNextPath("https://evil.example")).toBe("/dashboard");
  expect(safeNextPath("//evil.example")).toBe("/dashboard");
  expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
  expect(safeNextPath(null)).toBe("/dashboard");
});

test("route classification", () => {
  expect(isProtected("/dashboard")).toBe(true);
  expect(isProtected("/dashboard/profile")).toBe(true);
  expect(isProtected("/reset-password")).toBe(true);
  expect(isProtected("/dashboardx")).toBe(false);
  expect(isProtected("/login")).toBe(false);
  expect(isGuestOnly("/login")).toBe(true);
  expect(isGuestOnly("/signup")).toBe(true);
  expect(isGuestOnly("/dashboard")).toBe(false);
});
