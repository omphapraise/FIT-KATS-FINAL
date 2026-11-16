import { Suspense } from "react";
import { BlockSkeleton, EmptyState, PageHeader, SectionError } from "@/components/member";
import { MarkReadButton } from "@/components/member-actions";
import { Pill } from "@/components/staff";
import { apiGet, type Announcement } from "@/lib/api";
import { formatDate } from "@/lib/format";

async function AnnouncementsData() {
  const r = await apiGet<Announcement[]>("/announcements");
  if (!r.ok) return <SectionError title="Announcements" message={r.message} />;
  const rows = Array.isArray(r.body.data) ? r.body.data : [];
  if (rows.length === 0) return <EmptyState>No announcements right now.</EmptyState>;
  const unread = r.body.unread_count ?? rows.filter((a) => !a.is_read).length;

  return (
    <div>
      <p className="text-sm text-charcoal/70">{unread === 0 ? "You are all caught up." : `${unread} unread`}</p>
      <ul className="mt-4 divide-y divide-charcoal/10 border-y border-charcoal/10">
        {rows.map((a) => (
          <li key={`${a.id}-${a.is_read ? 1 : 0}`} className="flex flex-wrap items-start justify-between gap-4 py-6">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/70">
                {formatDate(a.published_at)}
                {a.is_pinned ? <Pill tone="warn">Pinned</Pill> : null}
                {!a.is_read ? <Pill tone="ok">New</Pill> : null}
              </p>
              <p className="display mt-2 text-2xl text-forest">{a.title}</p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-charcoal/80">{a.body}</p>
            </div>
            {!a.is_read ? <MarkReadButton id={a.id} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AnnouncementsPage() {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="From the gym" title="Announcements">
        Notices from the Fit Kats team, pinned ones first.
      </PageHeader>
      <Suspense fallback={<BlockSkeleton rows={4} />}>
        <AnnouncementsData />
      </Suspense>
    </div>
  );
}
