import { redirect } from "next/navigation";
import { BACKEND_URL, getToken } from "@/lib/session";

export type Envelope<T> = {
  success: boolean;
  message?: string;
  count?: number;
  notice?: string | null;
  unread_count?: number;
  data: T;
};

export type ApiResult<T> =
  | { ok: true; body: Envelope<T> }
  | { ok: false; message: string };

/** Server-side GET against the backend with the HttpOnly cookie token. Redirects to /login without a token or on 401. */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const token = await getToken();
  if (!token) redirect("/login");

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "Cannot reach the Fit Kats server." };
  }

  if (res.status === 401) redirect("/login");

  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success !== true) {
    return { ok: false, message: body?.message ?? "Something went wrong loading this section." };
  }
  return { ok: true, body };
}

export type Me = {
  id: number;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  verification_status: "pending" | "verified" | "rejected";
  membership_tier: string;
  membership_expiry: string;
  loyalty_points: number;
  can_check_in: boolean;
  check_in_message?: string | null;
};

export type Membership = {
  tier: string;
  status: "Active" | "Expired";
  expiry: string;
  perks: unknown[];
};

export type Booking = {
  id: number;
  class_id: number;
  status: string;
  title: string;
  coach: string | null;
  starts_at: string;
  ends_at: string;
  is_upcoming: boolean;
};

export type ClassItem = {
  id: number;
  title: string;
  description: string | null;
  coach: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  spots_left: number;
  is_full: boolean;
  is_booked: boolean;
  my_booking_id: number | null;
};

export type ProgressData = {
  summary: { total_workouts: number; total_volume: number; exercise_count: number };
  exercises: {
    exercise_name: string;
    entries: number;
    best_weight: number;
    best_weight_date: string | null;
    series: { date: string; best_weight: number; volume: number }[];
  }[];
};

export type Payment = {
  id: number;
  amount: number;
  status: string;
  date: string;
  is_demo: boolean;
  provider: string | null;
};

export type Announcement = {
  id: number;
  title: string;
  body: string;
  published_at: string;
  is_pinned: boolean;
  is_read: boolean;
};

export type LoyaltyData = {
  balance: number;
  points_per_workout: number;
  max_rewarded_workouts_per_day: number;
  rewarded_workouts_today: number;
  transactions: { id: number; points: number; label: string; created_at: string }[];
};

export type ReferralData = {
  code: string;
  referrer_points: number;
  referred_points: number;
  pending_count: number;
  rewarded_count: number;
  points_earned: number;
};
