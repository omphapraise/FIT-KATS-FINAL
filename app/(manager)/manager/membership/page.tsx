import { Suspense } from "react";
import { StaffHeader, Panel } from "@/components/staff";
import { EmptyNote, ErrorPanel, SectionSkeleton } from "@/components/manager";
import { TierStack } from "@/components/manager-charts";
import { managerGet } from "@/lib/manager";
import { longDay, type MembershipData } from "@/lib/managerData";

const COLS = ["active", "expired", "pending", "rejected", "deactivated"] as const;

async function MembershipTable() {
  const r = await managerGet<MembershipData>("/manager/membership");
  if (!r.ok) return <ErrorPanel message={r.message} />;
  const d = r.body.data;

  if (d.tiers.length === 0) return <EmptyNote>No member accounts yet.</EmptyNote>;

  const totals = { active: 0, expired: 0, pending: 0, rejected: 0, deactivated: 0, total: 0 };
  d.tiers.forEach((t) => {
    COLS.forEach((c) => {
      totals[c] += t[c];
    });
    totals.total += t.total;
  });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-charcoal/65">
        As of {longDay(d.today)}. Status is worked out from verification, deactivation and the expiry date.
      </p>
      <Panel title="Members by tier and status">
        <TierStack data={d.tiers} />
      </Panel>
      <Panel title="The numbers">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="border-b border-charcoal/10 text-xs uppercase tracking-wide text-charcoal/60">
                <th scope="col" className="py-2 pr-4 font-semibold">Tier</th>
                {COLS.map((c) => (
                  <th key={c} scope="col" className="px-3 py-2 text-right font-semibold capitalize">
                    {c}
                  </th>
                ))}
                <th scope="col" className="py-2 pl-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.tiers.map((t) => (
                <tr key={t.tier} className="border-b border-charcoal/5">
                  <th scope="row" className="py-3 pr-4 font-semibold text-forest">{t.tier}</th>
                  {COLS.map((c) => (
                    <td key={c} className="px-3 py-3 text-right tabular-nums">{t[c]}</td>
                  ))}
                  <td className="py-3 pl-3 text-right font-semibold tabular-nums">{t.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="py-3 pr-4 text-charcoal">All tiers</th>
                {COLS.map((c) => (
                  <td key={c} className="px-3 py-3 text-right font-semibold tabular-nums">{totals[c]}</td>
                ))}
                <td className="py-3 pl-3 text-right font-bold tabular-nums">{totals.total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export default function ManagerMembershipPage() {
  return (
    <>
      <StaffHeader eyebrow="Management" title="Membership">
        How members split across Silver, Gold and Platinum, and where each membership stands today.
      </StaffHeader>
      <div className="mt-8">
        <Suspense fallback={<SectionSkeleton />}>
          <MembershipTable />
        </Suspense>
      </div>
    </>
  );
}
