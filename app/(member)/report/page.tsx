import { Suspense } from "react";
import { BlockSkeleton, EmptyState, PageHeader, SectionError, SectionHead } from "@/components/member";
import { ReportForm } from "@/components/member-actions";
import { Pill } from "@/components/staff";
import { apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";

type MyReport = {
  id: number;
  description?: string;
  status?: string;
  location?: string | null;
  equipment_name?: string | null;
  resolution_note?: string | null;
  created_at?: string;
};

async function MyReports() {
  const r = await apiGet<MyReport[]>("/reports");
  if (!r.ok) return <SectionError title="Your reports" message={r.message} />;
  const rows = Array.isArray(r.body.data) ? r.body.data : [];
  if (rows.length === 0) return <EmptyState>You have not reported anything yet.</EmptyState>;
  return (
    <ul className="mt-4 divide-y divide-charcoal/10 border-y border-charcoal/10">
      {rows.map((x) => (
        <li key={x.id} className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{x.equipment_name || x.description}</p>
            {x.status ? <Pill tone={x.status === "Resolved" ? "ok" : x.status === "In Progress" ? "warn" : "muted"}>{x.status}</Pill> : null}
          </div>
          <p className="text-sm text-charcoal/70">
            #{x.id}
            {x.location ? ` · ${x.location}` : ""}
            {x.created_at ? ` · ${formatDate(x.created_at)}` : ""}
          </p>
          {x.resolution_note ? <p className="mt-1 text-sm leading-relaxed text-charcoal/80">{x.resolution_note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export default function ReportPage() {
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Facilities" title="Report an issue">
        Broken equipment or something not right in the gym? Tell the team and they will pick it up. You can send up to five reports an hour.
      </PageHeader>
      <ReportForm />
      <section>
        <SectionHead title="Your reports" />
        <Suspense fallback={<BlockSkeleton rows={2} />}>
          <MyReports />
        </Suspense>
      </section>
    </div>
  );
}
