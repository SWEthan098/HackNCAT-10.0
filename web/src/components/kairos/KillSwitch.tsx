"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, IconPower, IconSnow, Modal, cn } from "@/components/ui";

type Phase = "armed" | "confirming" | "freezing" | "frozen";

/**
 * The global kill switch: one press (plus a confirmation) freezes every AI agent.
 * It lives in the console header so it is in reach on every page.
 *
 * `onFreeze` does the work (POST /killswitch) and throws with a readable message if the agents
 * were NOT frozen. The control never claims "frozen" unless that call succeeded.
 *
 * TODO(Jordan): the contract has no way to read the switch back, so this state resets on a page
 * reload. Once Daylen's kill switch is real (his step 11), read it on load (entity_state.frozen).
 */
export function KillSwitch({ onFreeze }: { onFreeze: () => Promise<void> }) {
  const [phase, setPhase] = useState<Phase>("armed");
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  const frozen = phase === "frozen";
  const freezing = phase === "freezing";

  // The key that had focus is gone once the agents are frozen; move focus to the result.
  useEffect(() => {
    if (frozen) statusRef.current?.focus();
  }, [frozen]);

  // Runs for Cancel, Escape and a backdrop click, and ALSO when the dialog closes itself after a
  // successful freeze. So it only steps back from "confirming": it never undoes "frozen" and
  // never interrupts "freezing" (the dialog stays so the result is seen).
  const close = () => {
    setPhase((p) => (p === "confirming" ? "armed" : p));
    setError(null);
  };

  const freeze = async () => {
    setPhase("freezing");
    setError(null);
    try {
      await onFreeze();
      setPhase("frozen");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The kill switch request failed.");
      setPhase("confirming");
    }
  };

  return (
    <>
      {!frozen && (
        <Button
          variant="danger"
          size="sm"
          icon={<IconPower size={16} />}
          onClick={() => setPhase("confirming")}
          aria-haspopup="dialog"
          className="before:absolute before:inset-x-0 before:-inset-y-1.5"
        >
          Kill switch
        </Button>
      )}
      <p
        ref={statusRef}
        role="status"
        tabIndex={-1}
        className={cn(frozen ? "flex items-center gap-1.5 whitespace-nowrap rounded-input text-sm font-medium" : "visually-hidden")}
      >
        {frozen && (
          <>
            <IconSnow size={16} className="text-accent-2" />
            All agents frozen
          </>
        )}
      </p>
      <Modal
        open={phase === "confirming" || freezing}
        onClose={close}
        title="Freeze every AI agent?"
        description="Every AI agent stops taking actions right away. People's accounts stay as they are."
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={freezing} autoFocus>
              Cancel
            </Button>
            <Button variant="danger" onClick={freeze} loading={freezing}>
              Freeze all agents
            </Button>
          </>
        }
      >
        {error && (
          <Alert tone="error" title="The agents are not frozen">
            {error} The agents may still be acting. Try again.
          </Alert>
        )}
      </Modal>
    </>
  );
}
