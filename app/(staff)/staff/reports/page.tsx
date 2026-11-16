import Link from "next/link";
import { Suspense } from "react";
import { BlockSkeleton, EmptyState, SectionError } from "@/components/member";
import { Pill, StaffHeader } from "@/components/staff";
import { ReportEditor, ReportHistory } from "@/components/staff-actions";
import { apiGet } from "@/lib/api";
import { staffGate } from "@/lib/staff";
import { asList, formatStamp, type StaffReport } from "@/lib/staffData";

type SP = Promise<{ status?: string; mine?: string }>;

const FILTERS = ["All", "Open", "In Progress", "Resolved"];

async function ReportList({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const g = await staffGate();
  if (!g.ok) return <SectionError title="Maintenance" message={g.message} />;

  const status = FILTERS.includes(sp.status ?? "") && sp.status !== "All" ? (sp.status as string) : "";
  const mine = sp.mine === "1";
  const qs = new URLSearchParams({ limit: "50" });
  if (status) qs.set("status", status);
  if (mine) qs.set("mine", "1");

  const r = await apiGet<unknown>(`/staff/reports?${qs.toString()}`);
  const rows = r.ok ? asList<StaffReport & { updated_at?: string }>(r.body.data, "reports") : [];
  const href = (s: string, m: boolean) =>
    `/staff/reports?${new URLSearchParams({ ...(s && s !== "All" ? { status: s } : {}), ...(m ? { mine: "1" } : {}) }).toString()}`;

  const sevTone = (s?: string | null) => (s === "High" ? "bad" : s === "Medium" ? "warn" : "muted");
  const statusTone = (s: string) => (s === "Resolved" ? "ok" : s === "In Progress" ? "warn" : "muted");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const on = (f === "All" && !status) || f === status;
          return (
            <Link key={f} href={href(f, mine)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-forest text-ivory" : "text-forest"}`}>
              {f}
            </Link>
          );
        })}
        <span className="mx-2 h-5 w-px bg-charcoal/15" aria-hidden />
        <Link href={href(status, !mine)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${mine ? "bg-amber text-charcoal" : "text-forest"}`}>
          Assigned to me
        </Link>
      </div>

      {!r.ok ? (
        <SectionError title="Reports" message={r.message} />
      ) : rows.length === 0 ? (
        <EmptyState>No maintenance reports match this filter.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((rep) => (
            <li key={rep.id} className="rounded-3xl bg-white ring-1 ring-charcoal/5">
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{rep.equipment_name || rep.description}</p>
                    <p className="text-sm text-charcoal/70">
                      #{rep.id}
                      {rep.location ? ` · ${rep.location}` : ""}
                      {rep.reporter_name ? ` · ${rep.reporter_name}` : ""} · {formatStamp(rep.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {rep.severity ? <Pill tone={sevTone(rep.severity)}>{rep.severity}</Pill> : null}
                    <Pill tone={statusTone(rep.status)}>{rep.status}</Pill>
                  </div>
                </summary>
                <div className="border-t border-charcoal/10 p-5">
                  <p className="text-sm leading-relaxed">{rep.description}</p>
                  <p className="mt-2 text-sm text-charcoal/70">
                    {rep.assignee_name ? `Assigned to ${rep.assignee_name}` : "Unassigned"}
                  </p>
                  <ReportEditor
                    key={`${rep.status}|${rep.severity}|${rep.resolution_note}|${rep.assigned_to}|${rep.updated_at}`}
                    id={rep.id}
                    status={rep.status}
                    severity={rep.severity ?? null}
                    resolutionNote={rep.resolution_note ?? null}
                    meId={g.me.id}
                    assignedToMe={rep.assigned_to === g.me.id}
                  />
                  <ReportHistory key={`h${rep.updated_at ?? rep.status}`} id={rep.id} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ReportsPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="space-y-8">
      <StaffHeader eyebrow="Operations" title="Maintenance">
        Equipment and facility reports from members. Open a report to assign it, set severity, update its status and read its history.
      </StaffHeader>
      <Suspense fallback={<BlockSkeleton rows={5} />}>
        <ReportList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
