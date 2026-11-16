import Link from "next/link";
import { Suspense } from "react";
import { BlockSkeleton, EmptyState, SectionError } from "@/components/member";
import { Pill, StaffHeader } from "@/components/staff";
import { ClassForm, ClassTools } from "@/components/staff-actions";
import { apiGet } from "@/lib/api";
import { formatDay, formatTime } from "@/lib/format";
import { staffGate } from "@/lib/staff";
import { asList, type StaffClass } from "@/lib/staffData";

type SP = Promise<{ scope?: string }>;

async function ClassesAdmin({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const scope = sp.scope === "past" ? "past" : "upcoming";
  const g = await staffGate();
  if (!g.ok) return <SectionError title="Classes" message={g.message} />;

  const r = await apiGet<unknown>(`/staff/classes?scope=${scope}`);
  const rows = r.ok ? asList<StaffClass>(r.body.data, "classes") : [];

  return (
    <div className="space-y-8">
      {scope === "upcoming" ? (
        <section>
          <h2 className="display mb-3 text-2xl text-forest">Add a class</h2>
          <ClassForm />
        </section>
      ) : null}

      <section>
        <div className="flex items-center gap-2">
          <Link href="/staff/classes" className={`rounded-full px-4 py-1.5 text-sm font-semibold ${scope === "upcoming" ? "bg-forest text-ivory" : "text-forest"}`}>
            Upcoming
          </Link>
          <Link href="/staff/classes?scope=past" className={`rounded-full px-4 py-1.5 text-sm font-semibold ${scope === "past" ? "bg-forest text-ivory" : "text-forest"}`}>
            Past
          </Link>
        </div>

        {!r.ok ? (
          <div className="mt-4"><SectionError title="Classes" message={r.message} /></div>
        ) : rows.length === 0 ? (
          <EmptyState>No {scope} classes.</EmptyState>
        ) : (
          <ul className="mt-4 divide-y divide-charcoal/10 border-y border-charcoal/10">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-charcoal/70">
                    {formatDay(c.starts_at)} · {formatTime(c.starts_at)} - {formatTime(c.ends_at)}
                    {c.coach ? ` · ${c.coach}` : ""}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold">
                    {c.title}
                    {c.is_cancelled ? <Pill tone="bad">Cancelled</Pill> : null}
                  </p>
                  <p className="mt-1 text-sm text-charcoal/70">
                    {typeof c.booked_count === "number" ? `${c.booked_count} of ${c.capacity} booked` : `Capacity ${c.capacity}`}
                  </p>
                </div>
                <ClassTools cls={c} editable={!c.is_cancelled && scope === "upcoming"} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function ClassesAdminPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="space-y-8">
      <StaffHeader eyebrow="Operations" title="Classes">
        Add, edit and cancel classes, and see who has booked. Cancelling does not change existing bookings.
      </StaffHeader>
      <Suspense fallback={<BlockSkeleton rows={5} />}>
        <ClassesAdmin searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
