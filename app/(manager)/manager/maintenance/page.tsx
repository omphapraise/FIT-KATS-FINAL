import { Suspense } from "react";
import { StaffHeader, Panel } from "@/components/staff";
import { BarList, ErrorPanel, Kpi, SectionSkeleton } from "@/components/manager";
import DateRange from "@/components/DateRange";
import { managerGet } from "@/lib/manager";
import { longDay, rangeQuery, type Maintenance, type RangeParams } from "@/lib/managerData";

const STATUS_ORDER = ["Open", "In Progress", "Resolved"];
const SEVERITY_ORDER = ["High", "Medium", "Low", "Unrated"];

function ordered(map: Record<string, number>, order: string[]) {
  return order.map((k) => ({ label: k, value: map[k] ?? 0 }));
}

function hoursLabel(h: number): string {
  if (h >= 48) return `${Math.round((h / 24) * 10) / 10} days`;
  return `${h} h`;
}

async function MaintenanceData({ sp }: { sp: RangeParams }) {
  const q = await rangeQuery(sp);
  const r = await managerGet<Maintenance>(`/manager/maintenance${q}`);
  if (!r.ok) return <ErrorPanel message={r.message} resetHref="/manager/maintenance" />;
  const d = r.body.data;

  return (
    <div className="flex flex-col gap-6">
      <DateRange key={d.from + d.to} basePath="/manager/maintenance" from={d.from} to={d.to} />
      <p className="text-sm text-charcoal/65">
        {longDay(d.from)} to {longDay(d.to)}. Reports are filtered by the date they were raised; the backlog is all time.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Reports raised" value={d.total} />
        <Kpi
          label="Avg. to resolve"
          value={d.avg_resolution_hours === null ? "n/a" : hoursLabel(d.avg_resolution_hours)}
          hint={
            d.avg_resolution_hours === null
              ? "No resolved reports in this range"
              : `Across ${d.resolved_count} resolved ${d.resolved_count === 1 ? "report" : "reports"}`
          }
        />
        <Kpi label="Open backlog" value={d.backlog.open} hint="All time" />
        <Kpi label="In progress" value={d.backlog.in_progress} hint="All time" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="By status">
          <BarList rows={ordered(d.by_status, STATUS_ORDER)} />
        </Panel>
        <Panel title="By severity">
          <BarList barClass="bg-amber" rows={ordered(d.by_severity, SEVERITY_ORDER)} />
        </Panel>
      </div>
    </div>
  );
}

export default function ManagerMaintenancePage({ searchParams }: { searchParams: RangeParams }) {
  return (
    <>
      <StaffHeader eyebrow="Management" title="Maintenance">
        Equipment and facility reports: how many came in, how serious, and how long they take to close.
      </StaffHeader>
      <div className="mt-8">
        <Suspense fallback={<SectionSkeleton />}>
          <MaintenanceData sp={searchParams} />
        </Suspense>
      </div>
    </>
  );
}
