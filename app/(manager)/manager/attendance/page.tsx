import { Suspense } from "react";
import { StaffHeader, Panel } from "@/components/staff";
import { BarList, EmptyNote, ErrorPanel, Kpi, SectionSkeleton } from "@/components/manager";
import { DayBars } from "@/components/manager-charts";
import DateRange from "@/components/DateRange";
import { managerGet } from "@/lib/manager";
import { fillDays, longDay, pct, rangeQuery, sourceName, type Attendance, type RangeParams } from "@/lib/managerData";

async function AttendanceData({ sp }: { sp: RangeParams }) {
  const q = await rangeQuery(sp);
  const r = await managerGet<Attendance>(`/manager/attendance${q}`);
  if (!r.ok) return <ErrorPanel message={r.message} resetHref="/manager/attendance" />;
  const d = r.body.data;
  const series = fillDays(d.from, d.to, d.by_day.map((x) => ({ date: x.date, value: x.count })));
  const c = d.classes;

  return (
    <div className="flex flex-col gap-6">
      <DateRange key={d.from + d.to} basePath="/manager/attendance" from={d.from} to={d.to} />
      <p className="text-sm text-charcoal/65">
        {longDay(d.from)} to {longDay(d.to)}. Check-ins are counted by South African calendar day.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Check-ins" value={d.total} />
        <Kpi label="Unique members" value={d.unique_members} />
        <Kpi
          label="Class fill rate"
          value={c.fill_rate === null ? "n/a" : pct(c.fill_rate)}
          hint={c.fill_rate === null ? "No scheduled class capacity in this range" : `${c.booked} booked of ${c.capacity} places`}
        />
        <Kpi label="Classes held" value={c.count} hint="Not cancelled, starting in this range" />
      </div>

      <Panel title="Check-ins per day">
        {d.total === 0 ? (
          <EmptyNote>No check-ins in this range.</EmptyNote>
        ) : (
          <DayBars data={series} title="Check-ins" color="#173D30" />
        )}
      </Panel>

      <Panel title="How members checked in">
        <BarList
          rows={d.by_source.map((s) => ({ label: sourceName(s.source), value: s.count }))}
          empty="No check-ins in this range."
        />
      </Panel>
    </div>
  );
}

export default function ManagerAttendancePage({ searchParams }: { searchParams: RangeParams }) {
  return (
    <>
      <StaffHeader eyebrow="Management" title="Attendance">
        Gym check-ins and class capacity for the dates you choose.
      </StaffHeader>
      <div className="mt-8">
        <Suspense fallback={<SectionSkeleton />}>
          <AttendanceData sp={searchParams} />
        </Suspense>
      </div>
    </>
  );
}
