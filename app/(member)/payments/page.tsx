import { Suspense } from "react";
import { BlockSkeleton, EmptyState, PageHeader, SectionError } from "@/components/member";
import { Pill } from "@/components/staff";
import { apiGet, type Payment } from "@/lib/api";
import { formatDate, formatRand } from "@/lib/format";

async function PaymentsData() {
  const r = await apiGet<Payment[]>("/payments");
  if (!r.ok) return <SectionError title="Payments" message={r.message} />;
  const rows = Array.isArray(r.body.data) ? r.body.data : [];

  return (
    <div className="space-y-5">
      {r.body.notice ? (
        <p className="rounded-2xl bg-amber/15 px-5 py-4 text-sm leading-relaxed text-charcoal">{r.body.notice}</p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState>No payments recorded yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-charcoal/10 border-y border-charcoal/10">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="display text-2xl text-forest">{formatRand(p.amount)}</p>
                <p className="text-sm text-charcoal/70">
                  {formatDate(p.date)}
                  {p.provider ? ` · ${p.provider}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {p.is_demo ? <Pill tone="muted">Demonstration</Pill> : null}
                <Pill tone={p.status === "Paid" ? "ok" : p.status === "Failed" ? "bad" : "warn"}>{p.status}</Pill>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Account" title="Payments">
        Your payment records. Fit Kats does not take real payments on this platform yet.
      </PageHeader>
      <Suspense fallback={<BlockSkeleton rows={4} />}>
        <PaymentsData />
      </Suspense>
    </div>
  );
}
