"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase";

// Protected page: redirects to /login without a session, then calls the
// FastAPI /me endpoint with the user's JWT to prove web -> api -> Supabase works.
export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [apiResult, setApiResult] = useState<string>("Loading...");

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) return router.replace("/login");
      setEmail(session.user.email ?? null);

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/me`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        setApiResult(`${res.status} ${JSON.stringify(await res.json(), null, 2)}`);
      } catch (e) {
        setApiResult(`API unreachable: ${String(e)}`);
      }
    })();
  }, [router]);

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
  }

  if (!email) return <main className="p-6">Loading...</main>;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <button onClick={logout} className="rounded border px-3 py-1 text-sm">
          Log out
        </button>
      </div>
      <p>
        Signed in as <strong>{email}</strong>
      </p>
      <h2 className="font-medium">GET {process.env.NEXT_PUBLIC_API_URL}/me</h2>
      <pre className="overflow-x-auto rounded bg-zinc-100 p-3 text-sm dark:bg-zinc-900">{apiResult}</pre>
    </main>
  );
}
