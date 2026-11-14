"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

type AuthState = {
  user: User | null;
  loading: boolean;
  /** This user's roles from public.user_roles. null until loaded; [] if none (or the lookup failed). */
  roles: string[] | null;
  signOut: () => Promise<void>;
  /** Fresh access token (auto-refreshed by supabase-js when close to expiry). */
  getAccessToken: () => Promise<string | null>;
  /** Call the FastAPI backend as the current user; retries once after a token refresh on 401. */
  api: <T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }) => Promise<T>;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Client-side session state for protected pages. Route protection itself happens on the
 * server in src/proxy.ts; this provider keeps the UI in sync (refreshes, sign-out in
 * another tab, expired sessions) and gives components an authenticated API client.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { notify } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    // getUser() validates the session with the Auth server (not just the local cookie).
    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) {
        router.replace(`${ROUTES.login}?reason=expired`);
        return;
      }
      setUser(data.user);
      setLoading(false);
      // RLS returns only this user's own rows.
      supabase
        .from("user_roles")
        .select("role")
        .then(({ data: rows, error: rolesError }) => {
          if (active) setRoles(rolesError || !rows ? [] : rows.map((r: { role: string }) => r.role));
        });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session: Session | null) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        // Full navigation, not router.replace: it drops every client-side cached route
        // (Cache Components keeps previous pages mounted but hidden), so no signed-in UI
        // or data stays in the tab after logout. Also fires for sign-out in another tab.
        window.location.assign(ROUTES.login);
      } else if (session?.user) {
        setUser(session.user);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const signOut = useCallback(async () => {
    await createClient().auth.signOut();
    // onAuthStateChange handles the redirect.
  }, []);

  const getAccessToken = useCallback(async () => {
    const { data } = await createClient().auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const api = useCallback(
    async <T,>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}) => {
      const token = await getAccessToken();
      try {
        return await apiFetch<T>(path, { ...init, token });
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 401) throw e;
        const { data } = await createClient().auth.refreshSession();
        if (!data.session) {
          notify("Your session has expired. Log in again.", "error");
          await createClient().auth.signOut();
          throw e;
        }
        return apiFetch<T>(path, { ...init, token: data.session.access_token });
      }
    },
    [getAccessToken, notify],
  );

  const value = useMemo(
    () => ({ user, loading, roles, signOut, getAccessToken, api }),
    [user, loading, roles, signOut, getAccessToken, api],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
