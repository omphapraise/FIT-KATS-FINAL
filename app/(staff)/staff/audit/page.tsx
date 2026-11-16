import Link from "next/link";
import { Suspense } from "react";
import { BlockSkeleton, EmptyState, SectionError } from "@/components/member";
import { StaffHeader } from "@/components/staff";
import { apiGet, type Envelope } from "@/lib/api";
import { staffGate } from "@/lib/staff";
import { asList, formatStamp, type AuditRow } from "@/lib/staffData";

type SP = Promise<{ before?: string }>;

function detailText(d: unknown): string {
  if (d === null || d === undefined) return "";
  if (typeof d === "string") return d;
  try {
    return JSON.stringify(d);
  } catch {
    return "";
  }
}

async function AuditLog({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const g = await staffGate();
  if (!g.ok) return <SectionError title="Audit log" message={g.message} />;
  if (g.me.role !== "manager") {
    return <EmptyState>The audit log is available to managers only.</EmptyState>;
  }

  const qs = new URLSearchParams({ limit: "50" });
  if (sp.before && /^\d+$/.test(sp.before)) qs.set("before", sp.before);
  const r = await apiGet<unknown>(`/staff/audit-log?${qs.toString()}`);
  if (!r.ok) return <SectionError title="Audit log" message={r.message} />;

  const rows = asList<AuditRow>(r.body.data, "entries");
  const body = r.body as Envelope<unknown> & { next_before?: number | string | null };
  const dataNext =
    r.body.data && typeof r.body.data === "object" && !Array.isArray(r.body.data)
      ? (r.body.data as { next_before?: number | string | null }).next_before
      : null;
  const next = body.next_before ?? dataNext ?? null;

  if (rows.length === 0) return <EmptyState>No audit entries.</EmptyState>;

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-3xl bg-white ring-1 ring-charcoal/5">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead>
            <tr className="border-b border-charcoal/10 text-xs uppercase tracking-[0.14em] text-charcoal/70">
              <th className="px-5 py-3 font-semibold">When</th>
              <th className="px-5 py-3 font-semibold">Who</th>
              <th className="px-5 py-3 font-semibold">Action</th>
              <th className="px-5 py-3 font-semibold">Target</th>
              <th className="px-5 py-3 font-semibold">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal/10 align-top">
            {rows.map((a, i) => (
              <tr key={a.id ?? i}>
                <td className="whitespace-nowrap px-5 py-3 text-charcoal/70">{formatStamp(a.created_at)}</td>
                <td className="px-5 py-3">{a.actor_name ?? "System"}</td>
                <td className="px-5 py-3 font-semibold">{a.action}</td>
                <td className="px-5 py-3">{a.target_type ? `${a.target_type}${a.target_id != null ? ` #${a.target_id}` : ""}` : "-"}</td>
                <td className="max-w-xs break-words px-5 py-3 font-mono text-xs text-charcoal/70">{detailText(a.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {next ? (
        <Link href={`/staff/audit?before=${next}`} className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
          Older entries
        </Link>
      ) : null}
    </div>
  );
}

export default function AuditPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="space-y-8">
      <StaffHeader eyebrow="Management" title="Audit log">
        Every staff and manager action that changes data, newest first.
      </StaffHeader>
      <Suspense fallback={<BlockSkeleton rows={6} />}>
        <AuditLog searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
