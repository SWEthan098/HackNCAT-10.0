"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(mode: "login" | "signup") {
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const { data, error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return setMessage(error.message);
    if (data.session) return router.push("/dashboard");
    setMessage("Check your email to confirm your account, then log in.");
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-semibold">Log in or sign up</h1>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit("login");
        }}
      >
        <input
          className="rounded border px-3 py-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="rounded border px-3 py-2"
          type="password"
          placeholder="Password (6+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Log in
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => submit("signup")}
            className="flex-1 rounded border px-4 py-2 disabled:opacity-50"
          >
            Sign up
          </button>
        </div>
      </form>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </main>
  );
}
