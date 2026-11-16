import Link from "next/link";
import { Suspense } from "react";
import { apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { BlockSkeleton, EmptyState, PageHeader, SectionError, SectionHead } from "@/components/member";
import ProgrammeForm from "@/components/ProgrammeForm";
import { DeleteProgrammeButton } from "@/components/ProgrammeActions";

type Row = { id: number; programme_id: string; title: string; created_at: string };

async function SavedList() {
  const res = await apiGet<Row[]>("/programmes");
  if (!res.ok) return <SectionError title="Saved programmes" message={res.message} />;
  const rows = Array.isArray(res.body.data) ? res.body.data : [];

  return (
    <section>
      <SectionHead title="Saved" action={<span className="text-sm font-semibold text-charcoal/70">{rows.length} of 20</span>} />
      {rows.length === 0 ? (
        <EmptyState>No saved programmes yet. Generate one and it is saved here automatically.</EmptyState>
      ) : (
        <ul className="mt-4 divide-y divide-charcoal/10 border-y border-charcoal/10">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-4 py-4">
              <Link href={`/programmes/${r.id}`} className="min-w-0 flex-1">
                <p className="truncate font-semibold text-charcoal hover:text-forest">{r.title}</p>
                <p className="text-sm text-charcoal/65">Saved {formatDate(r.created_at)}</p>
              </Link>
              <DeleteProgrammeButton id={r.id} />
            </li>
          ))}
        </ul>
      )}
      {rows.length >= 20 ? (
        <p className="mt-3 text-sm text-charcoal/75">You have reached the limit of 20. Delete one to save another.</p>
      ) : null}
    </section>
  );
}

export default function ProgrammesPage() {
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Training plans" title="Programmes">
        Answer a few questions and Big Kat picks the closest written programme for you. Selection happens on the server from the Fit Kats
        knowledge base.
      </PageHeader>
      <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <ProgrammeForm />
        <Suspense fallback={<BlockSkeleton rows={3} />}>
          <SavedList />
        </Suspense>
      </div>
    </div>
  );
}
