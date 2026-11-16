import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui";

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header>
      <Eyebrow tone="forest">{eyebrow}</Eyebrow>
      <h1 className="display mt-3 text-5xl text-forest sm:text-6xl lg:text-7xl">{title}</h1>
      {children ? <p className="mt-4 max-w-xl text-base leading-relaxed text-charcoal/75">{children}</p> : null}
    </header>
  );
}

export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="display text-3xl text-forest">{title}</h2>
      {action}
    </div>
  );
}

export function SectionError({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-charcoal/15 bg-white/60 p-5">
      <p className="font-semibold text-charcoal">{title} could not load</p>
      <p className="mt-1 text-sm text-charcoal/70">{message}</p>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-sm leading-relaxed text-charcoal/70">{children}</p>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-charcoal/10 motion-reduce:animate-none ${className}`} />;
}

export function BlockSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      <Skeleton className="h-8 w-40" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function TopSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <Skeleton className="h-72 rounded-[2rem]" />
      <Skeleton className="h-72 rounded-[2rem]" />
    </div>
  );
}
