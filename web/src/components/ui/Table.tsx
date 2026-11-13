import type { ReactNode } from "react";
import { cn } from "./cn";
import { EmptyState, ErrorState } from "./States";
import { Skeleton } from "./Spinner";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Right-align and use tabular numerals. */
  numeric?: boolean;
  className?: string;
};

/**
 * Data table with its four states built in. Headers are sentence case in the body face
 * (no tracked capitals). Scrolls horizontally inside its own box on narrow screens.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  loading = false,
  error,
  onRetry,
  empty,
}: {
  columns: Column<T>[];
  rows: T[] | null | undefined;
  rowKey: (row: T) => string;
  caption?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: { title: string; description?: ReactNode; action?: ReactNode };
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!loading && rows && rows.length === 0) {
    return <EmptyState title={empty?.title ?? "Nothing here yet"} description={empty?.description} action={empty?.action} />;
  }
  return (
    <div className="overflow-x-auto rounded-card border border-rule">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead className="bg-paper-2">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn("border-b border-rule px-4 py-2.5 text-left font-medium text-muted", c.numeric && "text-right", c.className)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody aria-busy={loading || undefined}>
          {loading
            ? Array.from({ length: 3 }, (_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className="border-b border-rule px-4 py-3 last:border-b-0">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : rows?.map((row) => (
                <tr key={rowKey(row)} className="border-b border-rule last:border-b-0">
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3 align-top text-ink", c.numeric && "num text-right", c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
