import Link from "next/link";
import { Suspense } from "react";
import { BlockSkeleton, EmptyState, SectionError } from "@/components/member";
import { Pill, StaffHeader, VerificationPill } from "@/components/staff";
import { buttonClasses, inputClass } from "@/components/ui";
import { apiGet, type Envelope } from "@/lib/api";
import { staffGate } from "@/lib/staff";
import { asList, type MemberRow } from "@/lib/staffData";

type SP = Promise<{ q?: string; status?: string }>;

async function MemberList({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const g = await staffGate();
  if (!g.ok) return <SectionError title="Members" message={g.message} />;

  const q = (sp.q ?? "").trim();
  const status = ["pending", "verified", "rejected"].includes(sp.status ?? "") ? (sp.status as string) : "";
  const qs = new URLSearchParams({ limit: "50" });
  if (q) qs.set("q", q);
  if (status) qs.set("status", status);

  const r = await apiGet<unknown>(`/staff/members?${qs.toString()}`);
  if (!r.ok) return <SectionError title="Members" message={r.message} />;

  const rows = asList<MemberRow>(r.body.data, "members");
  const total = (r.body as Envelope<unknown> & { total?: number }).total;

  return (
    <div className="space-y-5">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="q" className="mb-1 block text-sm font-semibold">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Name, email or phone" className={inputClass} />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-semibold">Verification</label>
          <select id="status" name="status" defaultValue={status} className={inputClass}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <button type="submit" className={buttonClasses("primary", "md")}>Search</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState>No members match that search.</EmptyState>
      ) : (
        <>
          <p className="text-sm text-charcoal/70">
            Showing {rows.length}
            {typeof total === "number" ? ` of ${total}` : ""} members.
          </p>
          <div className="overflow-x-auto rounded-3xl bg-white ring-1 ring-charcoal/5">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-charcoal/10 text-xs uppercase tracking-[0.14em] text-charcoal/70">
                  <th className="px-5 py-3 font-semibold">Member</th>
                  <th className="px-5 py-3 font-semibold">Tier</th>
                  <th className="px-5 py-3 font-semibold">Membership</th>
                  <th className="px-5 py-3 font-semibold">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/10">
                {rows.map((m) => (
                  <tr key={m.id} className="hover:bg-ivory/60">
                    <td className="px-5 py-3">
                      <Link href={`/staff/members/${m.id}`} className="font-semibold text-forest underline-offset-4 hover:underline">
                        {m.display_name}
                      </Link>
                      <p className="text-charcoal/70">{m.email}</p>
                    </td>
                    <td className="px-5 py-3">{m.membership_tier ?? "-"}</td>
                    <td className="px-5 py-3">
                      {m.is_active === false ? (
                        <Pill tone="bad">Deactivated</Pill>
                      ) : m.membership_status ? (
                        <Pill tone={m.membership_status === "Active" ? "ok" : "muted"}>{m.membership_status}</Pill>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-5 py-3"><VerificationPill status={m.verification_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function MembersPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="space-y-8">
      <StaffHeader
        eyebrow="Members"
        title="Find a member"
        action={<Link href="/staff/walk-in" className={buttonClasses("amber", "sm")}>Register walk-in</Link>}
      >
        Search by name, email or phone. Open a profile to verify, check in or add notes.
      </StaffHeader>
      <Suspense fallback={<BlockSkeleton rows={6} />}>
        <MemberList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
