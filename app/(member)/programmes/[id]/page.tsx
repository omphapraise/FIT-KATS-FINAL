import Link from "next/link";
import { Suspense } from "react";
import { apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { BlockSkeleton, PageHeader, SectionError, SectionHead } from "@/components/member";
import { AdaptPanel, DeleteProgrammeButton } from "@/components/ProgrammeActions";
import { Loose, isObj, list, str, type Obj } from "@/components/Loose";

function dose(slot: Obj): string {
  const min = slot.sets_min;
  const max = slot.sets_max;
  if (slot.dose_stated !== true || min === null || min === undefined) return "";
  const sets = max === null || max === undefined || max === min ? str(min) : `${str(min)}-${str(max)}`;
  return `${sets} \u00d7 ${str(slot.reps)}${slot.per_side === true ? " per side" : ""}`;
}

function Facts({ summary }: { summary: Obj }) {
  const minutes = list(summary.session_minutes).map(str).filter(Boolean);
  const weeks = list(summary.programme_weeks).map(str).filter(Boolean);
  const rows: [string, unknown][] = [
    ["Training days", summary.days_used === null || summary.days_used === undefined ? "" : `${str(summary.days_used)} of ${str(summary.days_available)} available`],
    ["Session length", minutes.length ? `${minutes.join("-")} minutes` : ""],
    ["Programme length", weeks.length ? `${weeks.join("-")} weeks` : ""],
    ["Rest", summary.rest],
    ["Target effort (RIR)", summary.target_rir],
    ["Effort note", summary.effort_note],
  ];
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (shown.length === 0) return null;
  return (
    <dl className="grid gap-5 border-t border-charcoal/10 pt-5 sm:grid-cols-2">
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/65">{k}</dt>
          <dd className="mt-1 text-sm leading-relaxed text-charcoal">
            <Loose value={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Sessions({ sessions }: { sessions: Obj[] }) {
  return (
    <div className="space-y-6">
      {sessions.map((s, i) => {
        const slots = list(s.slots).filter(isObj);
        return (
          <section key={i} className="rounded-[2rem] border border-charcoal/10 bg-white/60 p-6">
            <h3 className="display text-3xl text-forest">{str(s.name) || `Session ${i + 1}`}</h3>
            {str(s.day) ? <p className="text-sm text-charcoal/65">{str(s.day)}</p> : null}
            {slots.length === 0 ? <p className="mt-3 text-sm text-charcoal/75">{str(s.list_note) || "No exercises listed."}</p> : null}
            <ul className="mt-4 divide-y divide-charcoal/10">
              {slots.map((sl, j) => {
                const options = list(sl.options).filter(isObj);
                const d = dose(sl);
                return (
                  <li key={j} className="space-y-2 py-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="font-semibold text-charcoal">{str(sl.label)}</p>
                      {d ? <p className="display shrink-0 text-2xl text-forest">{d}</p> : null}
                    </div>
                    {!d && str(sl.dose_note) ? <p className="text-sm text-charcoal/70">{str(sl.dose_note)}</p> : null}
                    {str(sl.note) ? <p className="text-sm text-charcoal/75">{str(sl.note)}</p> : null}
                    {options.map((o, k) => (
                      <div key={`${str(o.id)}-${k}`} className="rounded-xl bg-ivory p-3 text-sm">
                        <p className="font-medium text-charcoal">{str(o.name) || str(o.id)}</p>
                        {o.details_available === true ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs font-semibold text-forest">Technique and safety</summary>
                            <div className="mt-2 space-y-2 text-charcoal/80">
                              <Loose value={o.execution} />
                              <Loose value={o.safety} />
                            </div>
                          </details>
                        ) : (
                          <p className="mt-1 text-xs text-charcoal/65">Technique text is pending review for this exercise.</p>
                        )}
                      </div>
                    ))}
                    {str(sl.option_note) ? <p className="text-xs text-charcoal/65">{str(sl.option_note)}</p> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiGet<unknown>(`/programmes/${encodeURIComponent(id)}`);
  if (!res.ok) return <SectionError title="Programme" message={res.message} />;

  const data = res.body.data;
  if (!isObj(data) || !isObj(data.plan)) return <SectionError title="Programme" message="The server sent an unexpected response." />;
  const plan = data.plan;
  const summary = isObj(plan.summary) ? plan.summary : {};
  const sessions = list(plan.sessions).filter(isObj);
  const notes = list(plan.notes).map(str).filter(Boolean);
  const progression = isObj(plan.progression) ? plan.progression : {};
  const alternatives = list(plan.alternatives).filter(isObj);
  const savedId = Number(data.id);

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Your programme" title={str(summary.title) || "Programme"}>
        {data.saved_at ? `Saved ${formatDate(str(data.saved_at))}.` : ""}
      </PageHeader>

      {data.knowledge_outdated === true ? (
        <p className="rounded-2xl border border-amber bg-amber/10 p-4 text-sm text-charcoal">
          This programme was saved from an older version of the Big Kat knowledge base. Generate a new one to get the latest.
        </p>
      ) : null}
      {plan.requires_clinician_confirmation === true ? (
        <p className="rounded-2xl border border-amber bg-amber/10 p-4 text-sm font-semibold text-charcoal">
          Confirm this plan with your treating clinician before you start.
        </p>
      ) : null}

      <Facts summary={summary} />
      <Sessions sessions={sessions} />

      <section>
        <SectionHead title="Progression" />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-charcoal/80">
          {str(progression.text) || str(progression.note) || "No progression rule is stated for this programme."}
        </p>
        <p className="mt-2 text-sm text-charcoal/65">Big Kat never raises your loads for you.</p>
      </section>

      {notes.length > 0 ? (
        <section>
          <SectionHead title="Notes" />
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-charcoal/80">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {alternatives.length > 0 ? (
        <p className="text-sm text-charcoal/75">
          Closest alternatives: {alternatives.map((a) => str(a.title)).filter(Boolean).join(", ")}.
        </p>
      ) : null}

      {Number.isInteger(savedId) ? (
        <section className="space-y-4">
          <SectionHead title="Adjust" />
          <AdaptPanel id={savedId} />
        </section>
      ) : null}

      {str(plan.disclaimer) ? <p className="text-xs leading-relaxed text-charcoal/65">{str(plan.disclaimer)}</p> : null}

      {Number.isInteger(savedId) ? (
        <div>
          <DeleteProgrammeButton id={savedId} goToList />
        </div>
      ) : null}
    </div>
  );
}

export default function ProgrammeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="space-y-8">
      <Link href="/programmes" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
        All programmes
      </Link>
      <Suspense fallback={<BlockSkeleton rows={4} />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}
