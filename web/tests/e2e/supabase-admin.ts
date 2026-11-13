// Test-only Supabase admin helpers. Runs in the Playwright (Node) process, never in the
// browser bundle. Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the environment or,
// locally, from api/.env. Only ever touches the user ids this test run created.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadApiEnv(): Record<string, string> {
  try {
    const text = readFileSync(resolve(process.cwd(), "../api/.env"), "utf8");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

const fileEnv = loadApiEnv();
const URL_ = (process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const adminConfigured = Boolean(URL_ && KEY && !KEY.startsWith("your-"));

const headers = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

export type AdminUser = { id: string; email: string; email_confirmed_at: string | null };

export async function findUserByEmail(email: string): Promise<AdminUser | null> {
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${URL_}/auth/v1/admin/users?page=${page}&per_page=100`, { headers: headers() });
    if (!res.ok) throw new Error(`admin list users failed: ${res.status}`);
    const { users } = (await res.json()) as { users: AdminUser[] };
    const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < 100) return null;
  }
  return null;
}

export async function getProfile(id: string): Promise<{ id: string } | null> {
  const res = await fetch(`${URL_}/rest/v1/profiles?id=eq.${id}&select=id,created_at`, { headers: headers() });
  if (!res.ok) throw new Error(`profile lookup failed: ${res.status}`);
  const rows = (await res.json()) as { id: string }[];
  return rows[0] ?? null;
}

/** Admin-generated recovery link (implicit flow), as the dashboard's "Send recovery" would send. */
export async function generateRecoveryActionLink(email: string, redirectTo: string): Promise<{ actionLink: string; redirectTo: string }> {
  const res = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ type: "recovery", email, redirect_to: redirectTo }),
  });
  if (!res.ok) throw new Error(`generate_link failed: ${res.status}`);
  const body = (await res.json()) as { action_link?: string; redirect_to?: string; properties?: { action_link?: string; redirect_to?: string } };
  return {
    actionLink: (body.action_link ?? body.properties?.action_link)!,
    redirectTo: (body.redirect_to ?? body.properties?.redirect_to)!,
  };
}

/** Recovery link token without sending an email (admin generate_link). */
export async function generateRecoveryTokenHash(email: string): Promise<string> {
  const res = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ type: "recovery", email }),
  });
  if (!res.ok) throw new Error(`generate_link failed: ${res.status}`);
  const body = (await res.json()) as { hashed_token?: string; properties?: { hashed_token?: string } };
  const hash = body.hashed_token ?? body.properties?.hashed_token;
  if (!hash) throw new Error("generate_link returned no hashed_token");
  return hash;
}

/** Delete exactly one user by id, refusing anything that is not a test address. */
export async function deleteTestUser(id: string, expectedEmail: string): Promise<void> {
  if (!/^e2e-[a-z0-9-]+@example\.com$/.test(expectedEmail)) throw new Error(`refusing to delete non-test user ${expectedEmail}`);
  const res = await fetch(`${URL_}/auth/v1/admin/users/${id}`, { headers: headers() });
  if (!res.ok) throw new Error(`lookup before delete failed: ${res.status}`);
  const user = (await res.json()) as AdminUser;
  if (user.email?.toLowerCase() !== expectedEmail.toLowerCase()) throw new Error("id/email mismatch, not deleting");
  const del = await fetch(`${URL_}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: headers() });
  if (!del.ok) throw new Error(`delete failed: ${del.status}`);
}
