"use client";

import { useEffect } from "react";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

const LINK_TYPES = new Set(["recovery", "signup", "magiclink", "invite", "email_change"]);

/**
 * Handles Supabase email links that use the implicit flow, where tokens arrive in the URL
 * hash (#access_token=...&type=recovery). That happens when the email was triggered outside
 * this app (Supabase dashboard "Send password recovery", the admin API, or a script), so no
 * PKCE verifier exists. The hash never reaches the server, so this runs in the browser:
 * it strips the tokens from the address bar, validates them via setSession (which calls the
 * Auth server), then sends recovery links to /reset-password.
 * In-app requests use PKCE (?code=) and are handled by /auth/callback instead.
 */
export function AuthHashHandler() {
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const errorCode = hash.get("error_code") ?? hash.get("error");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const type = hash.get("type") ?? "";
    if (!errorCode && !(accessToken && refreshToken && LINK_TYPES.has(type))) return;

    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (errorCode) {
      window.location.replace(`${ROUTES.login}?error=link_invalid`);
      return;
    }
    createClient()
      .auth.setSession({ access_token: accessToken!, refresh_token: refreshToken! })
      .then(({ error }) => {
        if (error) window.location.replace(`${ROUTES.login}?error=link_invalid`);
        else window.location.replace(type === "recovery" ? ROUTES.resetPassword : ROUTES.dashboard);
      });
  }, []);
  return null;
}
