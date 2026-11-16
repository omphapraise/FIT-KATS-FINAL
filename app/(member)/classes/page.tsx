import { Suspense } from "react";
import BookButton from "@/components/BookButton";
import { BlockSkeleton, EmptyState, PageHeader, SectionError } from "@/components/member";
import { apiGet, type ClassItem } from "@/lib/api";
import { formatDay, formatTime } from "@/lib/format";

async function ClassList() {
  const r = await apiGet<ClassItem[]>("/classes");
  if (!r.ok) return <SectionError title="Classes" message={r.message} />;
  if (r.body.data.length === 0) return <EmptyState>No upcoming classes are scheduled right now.</EmptyState>;

  const days = new Map<string, ClassItem[]>();
  for (const c of r.body.data) {
    const key = formatDay(c.starts_at);
    days.set(key, [...(days.get(key) ?? []), c]);
  }

  return (
    <div className="space-y-10">
      {[...days.entries()].map(([day, items]) => (
        <section key={day}>
          <h2 className="display text-3xl text-forest">{day}</h2>
          <ul className="mt-3 divide-y divide-charcoal/10 border-y border-charcoal/10">
            {items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-charcoal/70">
                    {formatTime(c.starts_at)} - {formatTime(c.ends_at)}
                    {c.coach ? ` · ${c.coach}` : ""}
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {c.title}
                    {c.is_booked ? (
                      <span className="ml-3 rounded-full bg-forest px-2.5 py-0.5 align-middle text-xs font-medium text-ivory">
                        Booked
                      </span>
                    ) : null}
                  </p>
                  {c.description ? (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-charcoal/75">{c.description}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-charcoal/70">
                    {c.is_full ? "Full" : `${c.spots_left} of ${c.capacity} spots left`}
                  </p>
                </div>
                <BookButton classId={c.id} bookingId={c.my_booking_id} isFull={c.is_full} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function ClassesPage() {
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Timetable" title="Classes">
        Book a spot or cancel any time before a class starts.
      </PageHeader>
      <Suspense fallback={<BlockSkeleton rows={5} />}>
        <ClassList />
      </Suspense>
    </div>
  );
}
