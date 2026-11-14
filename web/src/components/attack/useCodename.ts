"use client";

// The visitor's codename ("Agent Falcon 27"): made on the first launch, kept on this device.
// No real names are ever asked for. Storage can be blocked (private mode), so every access is
// guarded and the page still works with a codename held only in memory.

import { useCallback, useSyncExternalStore } from "react";
import { generateCodename, isCodename } from "@/lib/attack";

const KEY = "kairos.codename";
const listeners = new Set<() => void>();
let memory: string | null = null;

function read(): string | null {
  try {
    const v = window.localStorage.getItem(KEY);
    if (isCodename(v)) return v;
  } catch {
    // storage blocked: fall back to memory
  }
  return memory;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function secureRandomInt(exclusiveMax: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % exclusiveMax;
}

export function useCodename(): { codename: string | null; ensureCodename: () => string } {
  const codename = useSyncExternalStore(subscribe, read, () => null);
  const ensureCodename = useCallback(() => {
    const existing = read();
    if (existing) return existing;
    const made = generateCodename(secureRandomInt);
    memory = made;
    try {
      window.localStorage.setItem(KEY, made);
    } catch {
      // kept in memory for this visit
    }
    listeners.forEach((l) => l());
    return made;
  }, []);
  return { codename, ensureCodename };
}
