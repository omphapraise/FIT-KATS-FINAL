import { Suspense } from "react";
import { StaffHeader, Panel } from "@/components/staff";
import { BarList, DemoBanner, EmptyNote, ErrorPanel, Kpi, SectionSkeleton } from "@/components/manager";
import { DayBars } from "@/components/manager-charts";
import DateRange from "@/components/DateRange";
import { managerGet } from "@/lib/manager";
import { fillDays, longDay, paymentTypeName, rand, rangeQuery, type RangeParams, type Revenue } from "@/lib/managerData";

async function RevenueData({ sp }: { sp: RangeParams }) {
  const q = await rangeQuery(sp);
  const r = await managerGet<Revenue>(`/manager/revenue${q}`);
  if (!r.ok) return <ErrorPanel message={r.message} resetHref="/manager/revenue" />;
  const d = r.body.data;
  const notice = r.body.notice;
  const series = fillDays(from(d), d.to, d.by_day.map((x) => ({ date: x.date, value: x.paid })));

  return (
    <div className="flex flex-col gap-6">
      <DateRange key={d.from + d.to} basePath="/manager/revenue" from={d.from} to={d.to} />
      {notice ? <DemoBanner>{notice}</DemoBanner> : null}
      {!d.all_demo ? (
        <p className="text-sm text-charcoal/65">This range includes records not marked as demonstration.</p>
      ) : null}
      <p className="text-sm text-charcoal/65">
        {longDay(d.from)} to {longDay(d.to)}. Amounts are by payment date.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Paid" value={rand(d.totals.paid)} hint={`${d.counts.paid} ${d.counts.paid === 1 ? "payment" : "payments"}`} />
        <Kpi label="Pending" value={rand(d.totals.pending)} hint={`${d.counts.pending} ${d.counts.pending === 1 ? "payment" : "payments"}`} />
        <Kpi label="Failed" value={rand(d.totals.failed)} hint={`${d.counts.failed} ${d.counts.failed === 1 ? "payment" : "payments"}`} />
      </div>

      <Panel title="Paid per day">
        {d.by_day.length === 0 ? (
          <EmptyNote>No paid payments in this range.</EmptyNote>
        ) : (
          <DayBars data={series} title="Paid" prefix="R" color="#173D30" />
        )}
      </Panel>

      <Panel title="Paid by type">
        <BarList
          barClass="bg-amber"
          rows={d.by_type.map((t) => ({
            label: paymentTypeName(t.payment_type),
            value: t.paid,
            display: `${rand(t.paid)} (${t.count})`,
          }))}
          empty="No paid payments in this range."
        />
      </Panel>
    </div>
  );
}

function from(d: Revenue) {
  return d.from;
}

export default function ManagerRevenuePage({ searchParams }: { searchParams: RangeParams }) {
  return (
    <>
      <StaffHeader eyebrow="Management" title="Revenue">
        Payments by date and type. No payment provider is connected, so every figure here is demonstration data.
      </StaffHeader>
      <div className="mt-8">
        <Suspense fallback={<SectionSkeleton />}>
          <RevenueData sp={searchParams} />
        </Suspense>
      </div>
    </>
  );
}
