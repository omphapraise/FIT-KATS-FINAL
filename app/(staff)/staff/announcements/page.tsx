import Link from "next/link";
import { Suspense } from "react";
import { BlockSkeleton, EmptyState, SectionError } from "@/components/member";
import { Pill, StaffHeader } from "@/components/staff";
import { AnnouncementForm, AnnouncementTools } from "@/components/staff-actions";
import { apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { staffGate } from "@/lib/staff";
import { asList, type StaffAnnouncement } from "@/lib/staffData";

type SP = Promise<{ status?: string }>;

async function Announcements({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const status = sp.status === "archived" ? "archived" : "published";
  const g = await staffGate();
  if (!g.ok) return <SectionError title="Announcements" message={g.message} />;

  const r = await apiGet<unknown>(`/staff/announcements?status=${status}`);
  const rows = r.ok ? asList<StaffAnnouncement>(r.body.data, "announcements") : [];

  return (
    <div className="space-y-8">
      {status === "published" ? <AnnouncementForm /> : null}

      <section>
        <div className="flex items-center gap-2">
          <Link href="/staff/announcements" className={`rounded-full px-4 py-1.5 text-sm font-semibold ${status === "published" ? "bg-forest text-ivory" : "text-forest"}`}>
            Published
          </Link>
          <Link href="/staff/announcements?status=archived" className={`rounded-full px-4 py-1.5 text-sm font-semibold ${status === "archived" ? "bg-forest text-ivory" : "text-forest"}`}>
            Archived
          </Link>
        </div>

        {!r.ok ? (
          <div className="mt-4"><SectionError title="Announcements" message={r.message} /></div>
        ) : rows.length === 0 ? (
          <EmptyState>No {status} announcements.</EmptyState>
        ) : (
          <ul className="mt-4 divide-y divide-charcoal/10 border-y border-charcoal/10">
            {rows.map((a) => (
              <li key={`${a.id}-${a.title}-${a.is_pinned ? 1 : 0}`} className="flex flex-wrap items-start justify-between gap-4 py-5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/70">
                    {a.published_at ? formatDate(a.published_at) : ""}
                    {a.is_pinned ? <Pill tone="warn">Pinned</Pill> : null}
                  </p>
                  <p className="mt-1 font-semibold">{a.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-charcoal/75">{a.body}</p>
                </div>
                {status === "published" ? (
                  <AnnouncementTools id={a.id} title={a.title} body={a.body} pinned={Boolean(a.is_pinned)} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AnnouncementsPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="space-y-8">
      <StaffHeader eyebrow="Communication" title="Announcements">
        Publish and edit notices members see on their dashboard. Archived announcements cannot be restored.
      </StaffHeader>
      <Suspense fallback={<BlockSkeleton rows={5} />}>
        <Announcements searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
