import Link from "next/link";
import { Suspense } from "react";
import MemberActions from "@/components/MemberActions";
import { BlockSkeleton, EmptyState, SectionError } from "@/components/member";
import { Panel, Pill, StaffHeader, VerificationPill } from "@/components/staff";
import { NoteForm } from "@/components/staff-actions";
import { apiGet } from "@/lib/api";
import { formatDate, formatRand } from "@/lib/format";
import { staffGate } from "@/lib/staff";
import {
  asList,
  formatStamp,
  sourceLabel,
  type CheckinRow,
  type MemberRow,
  type NoteRow,
  type PaymentRow,
} from "@/lib/staffData";

async function Profile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return <SectionError title="Member" message="That member link is not valid." />;

  const g = await staffGate();
  if (!g.ok) return <SectionError title="Member" message={g.message} />;

  const r = await apiGet<Record<string, unknown>>(`/staff/members/${id}`);
  if (!r.ok) return <SectionError title="Member" message={r.message} />;

  const d = r.body.data;
  const m = ((d.member as MemberRow | undefined) ?? (d as unknown as MemberRow));
  const checkins = asList<CheckinRow>(d.recent_checkins);
  const payments = asList<PaymentRow>(d.payments);
  const notes = asList<NoteRow>(d.notes);
  const upcoming = typeof d.upcoming_bookings === "number" ? d.upcoming_bookings : null;
  const paymentsNotice = typeof d.payments_notice === "string" ? d.payments_notice : null;
  const status = m.verification_status ?? "verified";

  return (
    <div className="space-y-8">
      <StaffHeader
        eyebrow="Member profile"
        title={m.display_name}
        action={<Link href="/staff/members" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">All members</Link>}
      >
        {m.email}
        {m.phone ? ` · ${m.phone}` : ""}
      </StaffHeader>

      <div className="flex flex-wrap items-center gap-2">
        <VerificationPill status={status} />
        {m.is_active === false ? <Pill tone="bad">Deactivated</Pill> : null}
        {m.membership_status ? <Pill tone={m.membership_status === "Active" ? "ok" : "muted"}>{m.membership_status}</Pill> : null}
        {m.membership_tier ? <Pill tone="muted">{m.membership_tier}</Pill> : null}
        {d.has_open_setup_code === true ? <Pill tone="warn">Setup code outstanding</Pill> : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-8">
          <Panel title="Membership">
            <dl className="grid grid-cols-3 gap-5 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-charcoal/70">Expires</dt>
                <dd className="mt-1 font-semibold">
                  {status === "pending" ? "After verification" : m.membership_expiry ? formatDate(m.membership_expiry) : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-charcoal/70">Points</dt>
                <dd className="mt-1 font-semibold">{m.loyalty_points ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-charcoal/70">Upcoming bookings</dt>
                <dd className="mt-1 font-semibold">{upcoming ?? "-"}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Actions">
            <MemberActions
              memberId={m.id ?? Number(id)}
              status={status}
              inactive={m.is_active === false}
              canCheckIn={m.can_check_in !== false}
              checkInMessage={m.check_in_message ?? null}
            />
          </Panel>

          <Panel title="Notes">
            <NoteForm memberId={m.id ?? Number(id)} />
            {notes.length === 0 ? (
              <EmptyState>No notes yet.</EmptyState>
            ) : (
              <ul className="mt-5 divide-y divide-charcoal/10 border-t border-charcoal/10">
                {notes.map((n, i) => (
                  <li key={n.id ?? i} className="py-3">
                    <p className="text-sm leading-relaxed">{n.note}</p>
                    <p className="mt-1 text-xs text-charcoal/70">
                      {n.author_name ?? "Staff"} · {formatStamp(n.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-8">
          <Panel title="Recent check-ins">
            {checkins.length === 0 ? (
              <EmptyState>No check-ins yet.</EmptyState>
            ) : (
              <ul className="divide-y divide-charcoal/10">
                {checkins.map((c, i) => (
                  <li key={c.id ?? i} className="flex items-center justify-between py-2.5 text-sm">
                    <span>
                      {sourceLabel(c.source)}
                      {c.checked_in_by_name ? ` · by ${c.checked_in_by_name}` : ""}
                    </span>
                    <span className="text-charcoal/70">{formatStamp(c.checked_in_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Payments">
            {payments.length === 0 ? (
              <EmptyState>No payment records.</EmptyState>
            ) : (
              <ul className="divide-y divide-charcoal/10">
                {payments.map((p, i) => (
                  <li key={p.id ?? i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-semibold">{formatRand(p.amount)}</span>
                    <span className="flex items-center gap-2">
                      {p.is_demo ? <Pill tone="muted">Demo</Pill> : null}
                      <span>{p.status}</span>
                      <span className="text-charcoal/70">{formatDate(p.date)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {paymentsNotice ? <p className="mt-3 text-xs leading-relaxed text-charcoal/70">{paymentsNotice}</p> : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<BlockSkeleton rows={8} />}>
      <Profile params={params} />
    </Suspense>
  );
}
