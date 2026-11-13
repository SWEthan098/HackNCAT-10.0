import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Browser Supabase client. Uses the public anon/publishable key; all data access is
// protected by Row Level Security. Never put the service role key in the web app.
//
// @supabase/ssr stores the session in cookies (not localStorage), so the proxy can read
// and refresh it on the server, and it survives reloads and browser restarts.
let client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}
