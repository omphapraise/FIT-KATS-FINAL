const TZ = "Africa/Johannesburg";

function toDate(value: string): Date | null {
  // Date-only and SQLite "YYYY-MM-DD HH:MM:SS" values: use the date part only (no guessed time zone).
  const s = /^\d{4}-\d{2}-\d{2}( |$)/.test(value) ? value.slice(0, 10) + "T00:00:00Z" : value;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string): string {
  const d = toDate(value);
  if (!d) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(d);
}

export function formatDay(value: string): string {
  const d = toDate(value);
  if (!d) return value;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(d);
}

export function formatTime(value: string): string {
  const d = toDate(value);
  if (!d) return value;
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(d);
}

export function dayNumber(value: string): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: TZ }).format(d);
}

export function monthShort(value: string): string {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: TZ }).format(d);
}

export function formatRand(amount: number): string {
  return "R" + Number(amount).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Member";
}
