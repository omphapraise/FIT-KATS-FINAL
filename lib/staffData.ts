// Pure helpers and types for staff screens (safe to import anywhere). Fields are optional because
// response bodies are read defensively until checked against staff.js.

export type MemberRow = {
  id: number;
  display_name: string;
  email: string;
  phone?: string | null;
  membership_tier?: string;
  membership_expiry?: string;
  loyalty_points?: number;
  verification_status?: "pending" | "verified" | "rejected";
  is_active?: boolean;
  membership_status?: string;
  can_check_in?: boolean;
  check_in_message?: string | null;
};

export type CheckinRow = {
  id?: number;
  display_name?: string;
  member_name?: string;
  checked_in_at?: string;
  source?: string;
  checked_in_by_name?: string | null;
};

export type NoteRow = { id?: number; note: string; author_name?: string | null; created_at?: string };
export type PaymentRow = { id?: number; amount: number; status: string; date: string; is_demo?: boolean };
export type BookingRow = { id?: number; title?: string; starts_at?: string; ends_at?: string; coach?: string | null };

export type StaffClass = {
  id: number;
  title: string;
  description?: string | null;
  coach?: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count?: number;
  spots_left?: number;
  is_cancelled?: boolean;
};

export type StaffReport = {
  id: number;
  description: string;
  status: string;
  location?: string | null;
  created_at?: string;
  severity?: string | null;
  equipment_name?: string | null;
  assigned_to?: number | null;
  assignee_name?: string | null;
  resolution_note?: string | null;
  reporter_name?: string | null;
};

export type StaffAnnouncement = {
  id: number;
  title: string;
  body: string;
  published_at?: string;
  is_pinned?: boolean;
  status?: string;
};

export type AuditRow = {
  id?: number;
  created_at?: string;
  action: string;
  target_type?: string | null;
  target_id?: number | string | null;
  actor_name?: string | null;
  detail?: unknown;
};

export function asList<T>(value: unknown, key?: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (key && value && typeof value === "object") {
    const inner = (value as Record<string, unknown>)[key];
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}

export function formatStamp(value: string | null | undefined): string {
  if (!value) return "-";
  // SQLite "YYYY-MM-DD HH:MM:SS" values are UTC.
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? value.replace(" ", "T") + "Z" : value;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Johannesburg",
  }).format(d);
}

export function sourceLabel(source?: string): string {
  if (source === "manual") return "Manual";
  if (source === "staff_qr") return "Staff scan";
  if (source === "qr") return "Kiosk QR";
  return source ?? "-";
}
