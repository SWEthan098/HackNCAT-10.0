import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-semibold">hackncat</h1>
      <p className="text-zinc-600 dark:text-zinc-400">Starter: Next.js + Supabase + FastAPI.</p>
      <div className="flex gap-3">
        <Link href="/login" className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
          Log in
        </Link>
        <Link href="/dashboard" className="rounded border px-4 py-2">
          Dashboard
        </Link>
      </div>
    </main>
  );
}
