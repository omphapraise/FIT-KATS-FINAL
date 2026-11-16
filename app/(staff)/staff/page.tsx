import Link from "next/link";
import { Suspense } from "react";
import CheckinPanel from "@/components/CheckinPanel";
import { BlockSkeleton, EmptyState, SectionError, SectionHead } from "@/components/member";
import { Panel, StaffHeader } from "@/components/staff";
import { apiGet } from "@/lib/api";
import { staffGate } from "@/lib/staff";
import { asList, formatStamp, sourceLabel, type CheckinRow, type MemberRow } from "@/lib/staffData";

async function FrontDesk() {
  const g = await staffGate();
  if (!g.ok) return <SectionError title="Front desk" message={g.message} />;

  const [pending, recent] = await Promise.all([
    apiGet<unknown>("/staff/members?status=pending&limit=6"),
    apiGet<unknown>("/staff/checkins?limit=12"),
  ]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-8">
        <Panel title="Check a member in">
          <CheckinPanel />
        </Panel>

        <section>
          <SectionHead
            title="Awaiting verification"
            action={
              <Link href="/staff/members?status=pending" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
                See all
              </Link>
            }
          />
          {!pending.ok ? (
            <div className="mt-4"><SectionError title="Pending members" message={pending.message} /></div>
          ) : (
            (() => {
              const rows = asList<MemberRow>(pending.body.data, "members");
              if (rows.length === 0) return <EmptyState>No sign-ups are waiting for verification.</EmptyState>;
              return (
                <ul className="mt-4 divide-y divide-charcoal/10 border-y border-charcoal/10">
                  {rows.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{m.display_name}</p>
                        <p className="truncate text-sm text-charcoal/70">{m.email}{m.membership_tier ? ` · ${m.membership_tier}` : ""}</p>
                      </div>
                      <Link href={`/staff/members/${m.id}`} className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
                        Review
                      </Link>
                    </li>
                  ))}
                </ul>
              );
            })()
          )}
        </section>
      </div>

      <section>
        <SectionHead title="Recent check-ins" />
        {!recent.ok ? (
          <div className="mt-4"><SectionError title="Check-ins" message={recent.message} /></div>
        ) : (
          (() => {
            const rows = asList<CheckinRow>(recent.body.data, "checkins");
            if (rows.length === 0) return <EmptyState>No check-ins recorded yet.</EmptyState>;
            return (
              <ul className="mt-4 divide-y divide-charcoal/10 border-y border-charcoal/10">
                {rows.map((c, i) => (
                  <li key={c.id ?? i} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.display_name ?? c.member_name ?? "Member"}</p>
                      <p className="text-sm text-charcoal/70">
                        {sourceLabel(c.source)}
                        {c.checked_in_by_name ? ` · by ${c.checked_in_by_name}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm text-charcoal/70">{formatStamp(c.checked_in_at)}</p>
                  </li>
                ))}
              </ul>
            );
          })()
        )}
      </section>
    </div>
  );
}

export default function StaffHomePage() {
  return (
    <div className="space-y-8">
      <StaffHeader eyebrow="Staff workspace" title="Front desk">
        Check members in, work through new sign-ups, and see who has arrived.
      </StaffHeader>
      <Suspense fallback={<BlockSkeleton rows={5} />}>
        <FrontDesk />
      </Suspense>
    </div>
  );
}
