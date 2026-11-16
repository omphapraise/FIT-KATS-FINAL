import { Suspense } from "react";
import { BlockSkeleton, EmptyState, PageHeader, SectionError, SectionHead } from "@/components/member";
import { RedeemForm } from "@/components/member-actions";
import { Pill } from "@/components/staff";
import { apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";

type Referral = {
  code: string;
  referrer_points: number;
  referred_points: number;
  monthly_cap: number;
  rewarded_this_month: number;
  can_redeem: boolean;
  cannot_redeem_reason: string | null;
  redeemed: { status: string; referrer_name: string; created_at: string } | null;
  pending_count: number;
  rewarded_count: number;
  capped_count: number;
  points_earned: number;
  referrals: { name: string; status: string; created_at: string; rewarded_at: string | null }[];
};

async function ReferralData() {
  const r = await apiGet<Referral>("/referral");
  if (!r.ok) return <SectionError title="Referrals" message={r.message} />;
  const d = r.body.data;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
      <section>
        <div className="rounded-[2rem] bg-forest p-8 text-ivory">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber">Your code</p>
          <p className="display mt-3 text-6xl tracking-widest">{d.code}</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ivory/80">
            When a friend uses it before their first check-in, you earn {d.referrer_points} points and they earn {d.referred_points}. Up to {d.monthly_cap} rewarded referrals a month.
          </p>
        </div>
        <dl className="mt-6 grid grid-cols-3 gap-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/70">Rewarded</dt>
            <dd className="display text-4xl text-forest">{d.rewarded_count}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/70">Pending</dt>
            <dd className="display text-4xl text-forest">{d.pending_count}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/70">Points earned</dt>
            <dd className="display text-4xl text-forest">{d.points_earned}</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-charcoal/70">
          {d.rewarded_this_month} of {d.monthly_cap} rewarded this month.
        </p>
      </section>

      <section className="space-y-8">
        <div>
          <SectionHead title="Have a code?" />
          <div className="mt-4">
            {d.redeemed ? (
              <p className="text-sm leading-relaxed text-charcoal/80">
                You used {d.redeemed.referrer_name}&rsquo;s code on {formatDate(d.redeemed.created_at)}. Status: {d.redeemed.status}.
              </p>
            ) : d.can_redeem ? (
              <RedeemForm />
            ) : (
              <p className="text-sm leading-relaxed text-charcoal/80">{d.cannot_redeem_reason ?? "You cannot use a code right now."}</p>
            )}
          </div>
        </div>

        <div>
          <SectionHead title="Friends you referred" />
          {d.referrals.length === 0 ? (
            <EmptyState>Nobody has used your code yet.</EmptyState>
          ) : (
            <ul className="mt-4 divide-y divide-charcoal/10 border-y border-charcoal/10">
              {d.referrals.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">{f.name}</p>
                    <p className="text-sm text-charcoal/70">Joined {formatDate(f.created_at)}</p>
                  </div>
                  <Pill tone={f.status === "rewarded" ? "ok" : f.status === "capped" ? "muted" : "warn"}>{f.status}</Pill>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default function ReferralPage() {
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Rewards" title="Referrals">
        Bring a friend in and both of you earn loyalty points.
      </PageHeader>
      <Suspense fallback={<BlockSkeleton rows={4} />}>
        <ReferralData />
      </Suspense>
    </div>
  );
}
