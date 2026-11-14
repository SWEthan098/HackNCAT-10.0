"use client";

// OWNER: Miles (P2). Red Team Console. STUB: runs the stub full chain.
// TODO(Miles): red theme, Protected/Unprotected toggle, stage cards, terminal log, Reset demo.
// May IMPORT from @/lib and @/components, never edit them.

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Disclaimer } from "@/components/kairos/Disclaimer";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui";
import type { RedteamRunResponse } from "@/lib/types/kairos";

export default function RedteamPage() {
  const { api } = useAuth();
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const r = await api<RedteamRunResponse>("/redteam/run", { method: "POST", body: { stage: "full_chain" } });
      setLog((l) => [...l, ...r.log_lines]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Red Team"
        description="Authorized testing against the fictional Cisco sandbox only."
        actions={
          <Button onClick={run} loading={running}>
            Run full chain
          </Button>
        }
      />
      <pre className="min-h-32 whitespace-pre-wrap rounded-card border border-rule bg-paper-2 p-4 text-sm">
        {log.length ? log.join("\n") : "No runs yet."}
      </pre>
      <Disclaimer />
    </>
  );
}
