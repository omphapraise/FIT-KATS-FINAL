import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui";

export function StaffHeader({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Eyebrow tone="forest">{eyebrow}</Eyebrow>
        <h1 className="display mt-2 text-4xl text-forest sm:text-5xl">{title}</h1>
        {children ? <p className="mt-3 max-w-xl text-sm leading-relaxed text-charcoal/75">{children}</p> : null}
      </div>
      {action}
    </header>
  );
}

const PILL = {
  ok: "bg-forest/10 text-forest",
  warn: "bg-amber/20 text-brown",
  bad: "bg-red-800/10 text-red-800",
  muted: "bg-charcoal/10 text-charcoal/80",
};

export function Pill({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[tone]}`}>
      {children}
    </span>
  );
}

export function VerificationPill({ status }: { status?: string }) {
  if (status === "pending") return <Pill tone="warn">Pending</Pill>;
  if (status === "rejected") return <Pill tone="bad">Rejected</Pill>;
  if (status === "verified") return <Pill tone="ok">Verified</Pill>;
  return <Pill tone="muted">{status ?? "Unknown"}</Pill>;
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-6 ring-1 ring-charcoal/5">
      <h2 className="display text-2xl text-forest">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
