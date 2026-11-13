import type { ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";
import { IconAlert, IconInbox } from "./Icons";
import { Skeleton } from "./Spinner";

// Every region that loads data has four states: loading, empty, error, full.

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-card border border-dashed border-rule-2 p-6", className)}>
      <span className="text-muted">{icon ?? <IconInbox />}</span>
      <div>
        <p className="font-medium text-ink">{title}</p>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "This didn't load",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-start gap-3 rounded-card border border-error/40 p-6", className)}>
      <IconAlert className="text-error" />
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm text-ink-2">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Skeleton lines in the rough shape of a text block. */
export function LoadingState({ lines = 3, label = "Loading", className }: { lines?: number; label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)} aria-busy="true">
      <span className="visually-hidden" role="status">
        {label}
      </span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
