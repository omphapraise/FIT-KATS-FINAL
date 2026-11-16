import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { StaffHeader, Panel } from "@/components/staff";
import { BarList, EmptyNote, ErrorPanel, Kpi, SectionSkeleton } from "@/components/manager";
import { managerGet } from "@/lib/manager";
import { longDay, type Overview } from "@/lib/managerData";

const SEGMENTS: { key: "active" | "expired" | "pending" | "rejected" | "deactivated"; label: string; bar: string }[] = [
  { key: "active", label: "Active", bar: "bg-ivory" },
  { key: "expired", label: "Expired", bar: "bg-amber" },
  { key: "pending", label: "Pending", bar: "bg-stone" },
  { key: "rejected", label: "Rejected", bar: "bg-brown" },
  { key: "deactivated", label: "Deactivated", bar: "bg-charcoal" },
];

async function OverviewData() {
  const r = await managerGet<Overview>("/manager/overview");
  if (!r.ok) return <ErrorPanel message={r.message} />;
  const d = r.body.data;
  const m = d.members;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-charcoal/65">Counts as of {longDay(d.today)}. Member figures exclude staff and manager accounts.</p>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <section className="rounded-3xl bg-forest p-7 text-ivory">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">Active members</p>
          <p className="display mt-3 text-8xl sm:text-9xl">{m.active}</p>
          <p className="mt-2 text-sm text-ivory/80">
            of {m.total} member {m.total === 1 ? "account" : "accounts"}
          </p>
          {m.total > 0 ? (
            <>
              <div className="mt-7 flex h-3 overflow-hidden rounded-full bg-ivory/15" role="img" aria-label="Members by status">
                {SEGMENTS.map((s) =>
                  m[s.key] > 0 ? (
                    <div key={s.key} className={s.bar} style={{ width: `${(m[s.key] / m.total) * 100}%` }} />
                  ) : null,
                )}
              </div>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {SEGMENTS.map((s) => (
                  <li key={s.key} className="flex items-center gap-2 text-ivory/85">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.bar}`} />
                    {s.label} <span className="tabular-nums font-semibold text-ivory">{m[s.key]}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-6 text-sm text-ivory/80">No member accounts yet.</p>
          )}
        </section>

        <div className="grid grid-cols-2 gap-4">
          <Kpi label="Check-ins today" value={d.checkins.today} />
          <Kpi label="Last 7 days" value={d.checkins.last_7_days} hint="Check-ins, including today" />
          <Kpi label="Expiring in 7 days" value={m.expiring_soon} hint="Active members" />
          <Kpi label="Upcoming classes" value={d.classes_upcoming} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Active by tier">
          <BarList
            rows={d.tiers.map((t) => ({ label: t.tier, value: t.count }))}
            empty="No active members on any tier."
          />
          <Link href="/manager/membership" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-forest">
            Tier and status detail <ArrowRight size={16} aria-hidden />
          </Link>
        </Panel>

        <Panel title="Maintenance">
          {d.reports.open + d.reports.in_progress === 0 ? (
            <EmptyNote>No open maintenance reports.</EmptyNote>
          ) : (
            <BarList
              barClass="bg-amber"
              rows={[
                { label: "Open", value: d.reports.open },
                { label: "In progress", value: d.reports.in_progress },
              ]}
            />
          )}
          <Link href="/manager/maintenance" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-forest">
            Maintenance analytics <ArrowRight size={16} aria-hidden />
          </Link>
        </Panel>

        <Panel title="Front desk workload">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-charcoal/75">Awaiting verification</dt>
              <dd className="tabular-nums font-semibold">{m.pending}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-charcoal/75">Expired memberships</dt>
              <dd className="tabular-nums font-semibold">{m.expired}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-charcoal/75">Published announcements</dt>
              <dd className="tabular-nums font-semibold">{d.announcements_published}</dd>
            </div>
          </dl>
          <Link href="/staff/members" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-forest">
            Open members <ArrowRight size={16} aria-hidden />
          </Link>
        </Panel>
      </div>
    </div>
  );
}

export default function ManagerOverviewPage() {
  return (
    <>
      <StaffHeader eyebrow="Management" title="Overview">
        A live read of members, attendance and maintenance from the Fit Kats database.
      </StaffHeader>
      <div className="mt-8">
        <Suspense fallback={<SectionSkeleton />}>
          <OverviewData />
        </Suspense>
      </div>
    </>
  );
}
