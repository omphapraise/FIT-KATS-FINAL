import { Suspense } from "react";
import { apiGet } from "@/lib/api";
import { BlockSkeleton, EmptyState, PageHeader, SectionError, SectionHead } from "@/components/member";

type Tx = {
  id: number;
  points: number;
  reason: string;
  ref: string | number | null;
  created_at: string;
  label: string;
};

type Loyalty = {
  balance: number;
  points_per_workout: number;
  max_rewarded_workouts_per_day: number;
  rewarded_workouts_today: number;
  points_earned_from_workouts_today: number;
  transactions: Tx[];
};

const stampFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Johannesburg",
  dateStyle: "medium",
  timeStyle: "short",
});

function stamp(value: string): string {
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? value : stampFormat.format(d);
}

async function LoyaltyContent() {
  const res = await apiGet<unknown>("/loyalty?limit=100");
  if (!res.ok) return <SectionError title="Loyalty" message={res.message} />;
  const body = res.body as unknown as { data?: Loyalty } | null;
  const data = body && body.data;
  if (!data) return <SectionError title="Loyalty" message="The server sent an unexpected response." />;
  const txs = Array.isArray(data.transactions) ? data.transactions : [];

  return (
    <div className="space-y-12">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[2rem] bg-brown p-8 text-ivory">
          <p className="text-sm font-medium uppercase tracking-widest text-ivory/70">Balance</p>
          <p className="display mt-2 text-7xl sm:text-8xl">{data.balance}</p>
          <p className="mt-1 text-sm text-ivory/80">loyalty points</p>
        </div>
        <div className="rounded-[2rem] border border-charcoal/10 bg-white/60 p-8">
          <p className="text-sm font-semibold text-charcoal">Today</p>
          <p className="display mt-2 text-5xl text-forest">
            {data.rewarded_workouts_today}/{data.max_rewarded_workouts_per_day}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-charcoal/75">
            rewarded workouts logged. Each earns {data.points_per_workout} points, up to {data.max_rewarded_workouts_per_day} a day.
            You have earned {data.points_earned_from_workouts_today} from workouts today.
          </p>
        </div>
      </div>

      <section>
        <SectionHead title="History" />
        {txs.length === 0 ? (
          <EmptyState>No loyalty activity yet. Log a workout to earn your first points.</EmptyState>
        ) : (
          <ul className="mt-4 divide-y divide-charcoal/10 rounded-2xl border border-charcoal/10 bg-white/60">
            {txs.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-charcoal">{t.label || t.reason}</p>
                  <p className="text-sm text-charcoal/65">{stamp(t.created_at)}</p>
                </div>
                <p className={`display shrink-0 text-2xl ${t.points >= 0 ? "text-forest" : "text-charcoal"}`}>
                  {t.points >= 0 ? "+" : "\u2212"}
                  {Math.abs(t.points)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function LoyaltyPage() {
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Rewards" title="Loyalty">
        Points you earn from logged workouts and referrals, with every change on record.
      </PageHeader>
      <Suspense fallback={<BlockSkeleton rows={4} />}>
        <LoyaltyContent />
      </Suspense>
    </div>
  );
}
