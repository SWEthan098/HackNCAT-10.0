"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

export type DropdownItem =
  | { type: "link"; label: string; href: string; icon?: ReactNode }
  | { type: "action"; label: string; onSelect: () => void; icon?: ReactNode; danger?: boolean }
  | { type: "label"; label: string };

/**
 * Menu button (WAI-ARIA menu pattern): Enter/Space/ArrowDown opens, arrows move,
 * Home/End jump, Escape closes and returns focus, outside click closes.
 */
export function Dropdown({
  trigger,
  triggerLabel,
  items,
  align = "end",
}: {
  trigger: ReactNode;
  triggerLabel: string;
  items: DropdownItem[];
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const focusItem = (index: number) => {
    const els = rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!els?.length) return;
    els[(index + els.length) % els.length].focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    requestAnimationFrame(() => focusItem(0));
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, () => void> = {
      ArrowDown: () => focusItem(i + 1),
      ArrowUp: () => focusItem(i - 1),
      Home: () => focusItem(0),
      End: () => focusItem(els.length - 1),
      Escape: () => close(),
    };
    if (moves[e.key]) {
      e.preventDefault();
      moves[e.key]();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  const itemClass = (danger?: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-input px-3 py-2 text-left text-sm no-underline transition-colors",
      "hover:bg-paper-2 focus-visible:bg-paper-2",
      danger ? "text-error" : "text-ink",
    );

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-9 items-center gap-2 rounded-input px-2 text-sm text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={triggerLabel}
          onKeyDown={onMenuKey}
          className={cn(
            "absolute top-full z-[100] mt-1 min-w-56 rounded-card border border-rule bg-paper p-1 shadow-card",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, i) =>
            item.type === "label" ? (
              <p key={i} className="truncate px-3 py-2 text-sm text-muted" role="presentation">
                {item.label}
              </p>
            ) : item.type === "link" ? (
              <Link key={i} role="menuitem" tabIndex={-1} href={item.href} className={itemClass()} onClick={() => close(false)}>
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <button
                key={i}
                role="menuitem"
                tabIndex={-1}
                type="button"
                className={itemClass(item.danger)}
                onClick={() => {
                  close(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
