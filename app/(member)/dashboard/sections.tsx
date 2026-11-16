import Link from "next/link";
import QrCheckin from "@/components/QrCheckin";
import { EmptyState, SectionError, SectionHead } from "@/components/member";
import {
  apiGet,
  type Announcement,
  type Booking,
  type LoyaltyData,
  type Me,
  type Membership,
  type Payment,
  type ProgressData,
  type ReferralData,
} from "@/lib/api";
import { dayNumber, firstName, formatDate, formatRand, formatTime, monthShort } from "@/lib/format";

export async function TopSection() {
  const [me, ms] = await Promise.all([apiGet<Me>("/me"), apiGet<Membership>("/membership")]);
  if (!me.ok) return <SectionError title="Your membership" message={me.message} />;

  const u = me.body.data;
  const m = ms.ok ? ms.body.data : null;
  const pending = u.verification_status === "pending";
  const rejected = u.verification_status === "rejected";

  const status = pending ? "Awaiting verification" : rejected ? "Not verified" : m ? m.status : "Unavailable";
  const expires = pending
    ? "After verification"
    : rejected
      ? "-"
      : formatDate(m ? m.expiry : u.membership_expiry);
  const perks =
    pending || rejected ? [] : (m?.perks ?? []).filter((p): p is string => typeof p === "string").slice(0, 4);

  return (
    <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="relative overflow-hidden rounded-[2rem] bg-forest p-8 text-ivory md:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-amber/40"
        />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber">{u.membership_tier} member</p>
          <h1 className="display mt-4 text-5xl sm:text-6xl lg:text-7xl">Hi, {firstName(u.display_name)}</h1>
          <dl className="mt-10 grid gap-6 border-t border-ivory/20 pt-6 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-ivory/70">Points</dt>
              <dd className="display mt-1 text-3xl">{u.loyalty_points}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-ivory/70">Status</dt>
              <dd className="display mt-1 text-2xl">{status}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-ivory/70">Expires</dt>
              <dd className="display mt-1 text-2xl">{expires}</dd>
            </div>
          </dl>
          {perks.length > 0 ? (
            <ul className="mt-6 flex flex-wrap gap-2">
              {perks.map((p) => (
                <li key={p} className="rounded-full border border-ivory/25 px-3 py-1 text-xs text-ivory/85">
                  {p}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="rounded-[2rem] bg-white p-6 ring-1 ring-charcoal/5">
        {u.can_check_in ? (
          <QrCheckin />
        ) : (
          <div>
            <h2 className="display text-2xl text-forest">Check-in</h2>
            <p className="mt-4 text-sm leading-relaxed text-charcoal/75">
              {u.check_in_message || "Check-in is not available on your account right now."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export async function UpcomingClasses() {
  const r = await apiGet<Booking[]>("/bookings");
  if (!r.ok) return <SectionError title="Your classes" message={r.message} />;

  const upcoming = r.body.data
    .filter((b) => b.is_upcoming)
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
    .slice(0, 4);

  return (
    <section>
      <SectionHead
        title="Your next classes"
        action={
          <Link href="/classes" className="text-sm font-semibold text-forest underline-offset-4 hover:underline">
            Browse classes
          </Link>
        }
      />
      {upcoming.length === 0 ? (
        <EmptyState>You have no upcoming bookings.</EmptyState>
      ) : (
        <ul className="mt-4 divide-y divide-charcoal/10 border-y border-charcoal/10">
          {upcoming.map((b) => (
            <li key={b.id} className="flex items-center gap-5 py-4">
              <div className="w-14 shrink-0 text-center text-forest">
                <p className="display text-4xl leading-none">{dayNumber(b.starts_at)}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em]">{monthShort(b.starts_at)}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{b.title}</p>
                <p className="text-sm text-charcoal/70">
                  {formatTime(b.starts_at)} - {formatTime(b.ends_at)}
                  {b.coach ? ` · ${b.coach}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 320;
  const h = 80;
  const pad = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i * (w - 2 * pad)) / (values.length - 1);
    const y = h - pad - ((v - min) / span) * (h - 2 * pad);
    return [x, y] as const;
  });
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="h-20 w-full text-forest">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="4" fill="#C58A35" />
    </svg>
  );
}

export async function ProgressSection() {
  const r = await apiGet<ProgressData>("/progress");
  if (!r.ok) return <SectionError title="Progress" message={r.message} />;

  const { summary, exercises } = r.body.data;
  const top = exercises.find((e) => e.series.length >= 2) ?? null;

  return (
    <section>
      <SectionHead title="Training" />
      {summary.total_workouts === 0 ? (
        <EmptyState>No workouts logged yet. Sessions you log will show up here.</EmptyState>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-6 border-t border-charcoal/10 pt-5">
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-charcoal/70">Workouts</dt>
              <dd className="display mt-1 text-4xl text-forest">{summary.total_workouts}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-charcoal/70">Volume (kg)</dt>
              <dd className="display mt-1 text-4xl text-forest">{summary.total_volume.toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-charcoal/70">Exercises</dt>
              <dd className="display mt-1 text-4xl text-forest">{summary.exercise_count}</dd>
            </div>
          </dl>
          {top ? (
            <div className="mt-6">
              <p className="text-sm font-semibold">
                {top.exercise_name}: best weight over time
                <span className="ml-2 font-normal text-charcoal/70">
                  peak {top.best_weight} kg{top.best_weight_date ? ` on ${formatDate(top.best_weight_date)}` : ""}
                </span>
              </p>
              <Sparkline
                values={top.series.map((s) => s.best_weight)}
                label={`${top.exercise_name} best weight across ${top.series.length} sessions`}
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export async function PaymentsSection() {
  const r = await apiGet<Payment[]>("/payments");
  if (!r.ok) return <SectionError title="Payments" message={r.message} />;

  const rows = r.body.data.slice(0, 5);
  const statusClass = (s: string) =>
    s === "Paid" ? "text-forest" : s === "Failed" ? "text-red-800" : "text-brown";

  return (
    <section>
      <SectionHead title="Payments" />
      {rows.length === 0 ? (
        <EmptyState>No payment records yet.</EmptyState>
      ) : (
        <ul className="mt-4 divide-y divide-charcoal/10 border-y border-charcoal/10">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="font-semibold">{formatRand(p.amount)}</p>
                <p className="text-sm text-charcoal/70">{formatDate(p.date)}</p>
              </div>
              <div className="flex items-center gap-2">
                {p.is_demo ? (
                  <span className="rounded-full border border-charcoal/20 px-2.5 py-0.5 text-xs font-medium text-charcoal/80">
                    Demo
                  </span>
                ) : null}
                <span className={`text-sm font-semibold ${statusClass(p.status)}`}>{p.status}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {r.body.notice ? <p className="mt-3 text-xs leading-relaxed text-charcoal/70">{r.body.notice}</p> : null}
    </section>
  );
}

export async function AnnouncementsSection() {
  const r = await apiGet<Announcement[]>("/announcements");
  if (!r.ok) return <SectionError title="Announcements" message={r.message} />;

  const items = r.body.data.slice(0, 3);
  const unread = r.body.unread_count ?? 0;

  return (
    <section>
      <SectionHead
        title="From the gym"
        action={unread > 0 ? <span className="text-sm font-semibold text-brown">{unread} unread</span> : undefined}
      />
      {items.length === 0 ? (
        <EmptyState>No announcements right now.</EmptyState>
      ) : (
        <ul className="mt-4 space-y-5 border-t border-charcoal/10 pt-5">
          {items.map((a) => (
            <li key={a.id}>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/70">
                {!a.is_read ? <span aria-label="Unread" className="h-2 w-2 rounded-full bg-amber" /> : null}
                {a.is_pinned ? "Pinned · " : ""}
                {formatDate(a.published_at)}
              </p>
              <p className="mt-1 font-semibold">{a.title}</p>
              <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-charcoal/75">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export async function LoyaltySection() {
  const r = await apiGet<LoyaltyData>("/loyalty?limit=4");
  if (!r.ok) return <SectionError title="Loyalty" message={r.message} />;

  const l = r.body.data;
  return (
    <section className="rounded-[2rem] bg-brown p-7 text-ivory">
      <h2 className="display text-2xl">Loyalty points</h2>
      <p className="display mt-3 text-6xl">{l.balance}</p>
      <p className="mt-2 text-sm text-ivory/85">
        {l.points_per_workout} points per logged workout. Today: {l.rewarded_workouts_today} of{" "}
        {l.max_rewarded_workouts_per_day} rewarded workouts.
      </p>
      {l.transactions.length > 0 ? (
        <ul className="mt-5 divide-y divide-ivory/20 border-t border-ivory/20">
          {l.transactions.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
              <span>
                {t.label}
                <span className="ml-2 text-ivory/75">{formatDate(t.created_at)}</span>
              </span>
              <span className="font-semibold">
                {t.points > 0 ? "+" : ""}
                {t.points}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export async function ReferralSection() {
  const r = await apiGet<ReferralData>("/referral");
  if (!r.ok) return <SectionError title="Referrals" message={r.message} />;

  const f = r.body.data;
  return (
    <section className="border-t-2 border-amber pt-5">
      <h2 className="display text-3xl text-forest">Bring a friend</h2>
      <p className="mt-3 select-all font-mono text-2xl font-semibold tracking-[0.2em] text-charcoal">{f.code}</p>
      <p className="mt-3 text-sm leading-relaxed text-charcoal/75">
        After their first check-in you get {f.referrer_points} points and they get {f.referred_points}.
      </p>
      <p className="mt-2 text-sm text-charcoal/75">
        {f.rewarded_count} rewarded · {f.pending_count} pending · {f.points_earned} points earned
      </p>
    </section>
  );
}
