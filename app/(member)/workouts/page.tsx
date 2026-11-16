import { Suspense } from "react";
import { BlockSkeleton, EmptyState, PageHeader, SectionError, SectionHead } from "@/components/member";
import { DeleteWorkoutButton, WorkoutForm } from "@/components/member-actions";
import { apiGet, type ProgressData } from "@/lib/api";
import { formatDate } from "@/lib/format";

type WorkoutRow = { id: number; exercise_name: string; sets: number; reps: number; weight: number; date: string };

function Trend({ points }: { points: number[] }) {
  const w = 140;
  const h = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const path = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = max === min ? h / 2 : h - 4 - ((v - min) / span) * (h - 8);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-36 text-forest" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

async function WorkoutsData() {
  const [w, p] = await Promise.all([apiGet<WorkoutRow[]>("/workouts"), apiGet<ProgressData>("/progress")]);
  const rows = w.ok && Array.isArray(w.body.data) ? w.body.data : [];
  const progress = p.ok ? p.body.data : null;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
      <section className="space-y-8">
        <div>
          <SectionHead title="Log a workout" />
          <div className="mt-4">
            <WorkoutForm />
          </div>
        </div>

        <div>
          <SectionHead title="History" />
          {!w.ok ? (
            <div className="mt-4"><SectionError title="Workouts" message={w.message} /></div>
          ) : rows.length === 0 ? (
            <EmptyState>No workouts logged yet. Your first one will show here.</EmptyState>
          ) : (
            <ul className="mt-4 divide-y divide-charcoal/10 border-y border-charcoal/10">
              {rows.slice(0, 50).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">{r.exercise_name}</p>
                    <p className="text-sm text-charcoal/70">
                      {r.sets} x {r.reps} at {r.weight} kg · {formatDate(r.date)}
                    </p>
                  </div>
                  <DeleteWorkoutButton id={r.id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <SectionHead title="Progress" />
        {!p.ok ? (
          <div className="mt-4"><SectionError title="Progress" message={p.message} /></div>
        ) : !progress || progress.exercises.length === 0 ? (
          <EmptyState>Log a few workouts and your strongest lifts will chart here.</EmptyState>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-3 gap-4 border-b border-charcoal/10 pb-6">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/70">Workouts</dt>
                <dd className="display text-4xl text-forest">{progress.summary.total_workouts}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/70">Exercises</dt>
                <dd className="display text-4xl text-forest">{progress.summary.exercise_count}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/70">Volume kg</dt>
                <dd className="display text-4xl text-forest">{Math.round(progress.summary.total_volume).toLocaleString("en-GB")}</dd>
              </div>
            </dl>
            <ul className="divide-y divide-charcoal/10">
              {progress.exercises.map((ex) => (
                <li key={ex.exercise_name} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{ex.exercise_name}</p>
                    <p className="text-sm text-charcoal/70">
                      Best {ex.best_weight} kg{ex.best_weight_date ? ` on ${formatDate(ex.best_weight_date)}` : ""} · {ex.entries} {ex.entries === 1 ? "entry" : "entries"}
                    </p>
                  </div>
                  {ex.series.length >= 2 ? (
                    <Trend points={ex.series.map((s) => s.best_weight)} />
                  ) : (
                    <p className="max-w-40 text-xs text-charcoal/70">Log it again to see a trend.</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

export default function WorkoutsPage() {
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Training" title="Workouts">
        Log your sets and watch your best lifts move. Up to three workouts a day earn loyalty points.
      </PageHeader>
      <Suspense fallback={<BlockSkeleton rows={5} />}>
        <WorkoutsData />
      </Suspense>
    </div>
  );
}
