import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client. Uses the anon/publishable key; all data access is
// protected by Row Level Security. Never put the service role key here.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
