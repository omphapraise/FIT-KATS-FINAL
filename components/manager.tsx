import Link from "next/link";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui";

export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-charcoal/5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-charcoal/60">{label}</p>
      <p className="display mt-3 text-5xl text-forest">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-charcoal/65">{hint}</p> : null}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-charcoal/20 px-4 py-6 text-center text-sm text-charcoal/65">
      {children}
    </p>
  );
}

export function ErrorPanel({ message, resetHref }: { message: string; resetHref?: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Alert tone="error">{message}</Alert>
      {resetHref ? (
        <Link href={resetHref} className="text-sm font-semibold text-forest underline underline-offset-4">
          Reset to the last 30 days
        </Link>
      ) : null}
    </div>
  );
}

export function DemoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-amber/40 bg-amber/15 px-4 py-3 text-sm leading-relaxed text-charcoal">
      <span className="mr-2 inline-block rounded-full bg-amber px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-charcoal">
        Demonstration data
      </span>
      {children}
    </div>
  );
}

/** Horizontal bars drawn from real values only. */
export function BarList({
  rows,
  barClass = "bg-forest",
  empty = "Nothing recorded for this selection.",
}: {
  rows: { label: string; value: number; display?: string }[];
  barClass?: string;
  empty?: string;
}) {
  if (rows.length === 0) return <EmptyNote>{empty}</EmptyNote>;
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-charcoal">{r.label}</span>
            <span className="tabular-nums text-charcoal/75">{r.display ?? r.value}</span>
          </div>
          <div className="mt-1.5 h-2.5 rounded-full bg-charcoal/10">
            <div
              className={`h-2.5 rounded-full ${barClass}`}
              style={{ width: max > 0 ? `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%` : "0%" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SectionSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-3xl bg-charcoal/10" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-3xl bg-charcoal/10" />
    </div>
  );
}
