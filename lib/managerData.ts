// Pure, client-safe types and helpers for the management workspace.

export type Overview = {
  today: string;
  members: {
    total: number;
    active: number;
    expired: number;
    pending: number;
    rejected: number;
    deactivated: number;
    expiring_soon: number;
  };
  tiers: { tier: string; count: number }[];
  checkins: { today: number; last_7_days: number };
  classes_upcoming: number;
  reports: { open: number; in_progress: number };
  announcements_published: number;
};

export type TierRow = {
  tier: string;
  active: number;
  expired: number;
  pending: number;
  rejected: number;
  deactivated: number;
  total: number;
};
export type MembershipData = { today: string; tiers: TierRow[] };

export type Revenue = {
  from: string;
  to: string;
  all_demo: boolean;
  totals: { paid: number; pending: number; failed: number };
  counts: { paid: number; pending: number; failed: number };
  by_day: { date: string; paid: number }[];
  by_type: { payment_type: string; count: number; paid: number }[];
};

export type Attendance = {
  from: string;
  to: string;
  total: number;
  unique_members: number;
  by_day: { date: string; count: number }[];
  by_source: { source: string; count: number }[];
  classes: { count: number; capacity: number; booked: number; fill_rate: number | null };
};

export type Maintenance = {
  from: string;
  to: string;
  total: number;
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  avg_resolution_hours: number | null;
  resolved_count: number;
  backlog: { open: number; in_progress: number };
};

export type StaffRow = {
  id: number;
  display_name: string;
  email: string;
  role: string;
  is_active: boolean;
  open_reports: number;
};

export type RangeParams = Promise<{ from?: string | string[]; to?: string | string[] }>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Turns the page's searchParams into "?from=..&to=.." (only well-formed values; the backend validates the rest). */
export async function rangeQuery(sp: RangeParams): Promise<string> {
  const p = await sp;
  const out = new URLSearchParams();
  const f = one(p.from);
  const t = one(p.to);
  if (f && DATE_RE.test(f)) out.set("from", f);
  if (t && DATE_RE.test(t)) out.set("to", t);
  const s = out.toString();
  return s ? `?${s}` : "";
}

export function rand(n: number): string {
  return `R${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
}

export function shortDay(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function longDay(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function pct(fraction: number): string {
  return `${Math.round(fraction * 1000) / 10}%`;
}

/** The backend omits days with no records; a day with no records is a real zero, so gaps are filled with 0. */
export function fillDays(from: string, to: string, rows: { date: string; value: number }[]) {
  const map = new Map(rows.map((r) => [r.date, r.value]));
  const out: { date: string; value: number }[] = [];
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z").getTime();
  for (let i = 0; i < 400 && d.getTime() <= end; i++) {
    const k = d.toISOString().slice(0, 10);
    out.push({ date: k, value: map.get(k) ?? 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const SOURCE: Record<string, string> = {
  qr: "Member QR code",
  manual: "Manual, front desk",
  staff_qr: "Staff QR scan",
};
export function sourceName(s: string): string {
  return SOURCE[s] ?? s;
}

const PAYMENT_TYPE: Record<string, string> = {
  membership: "Membership",
  signup_fee: "Sign-up fee",
  freeze_fee: "Freeze fee",
  cancellation_penalty: "Cancellation penalty",
};
export function paymentTypeName(s: string): string {
  return PAYMENT_TYPE[s] ?? s;
}
