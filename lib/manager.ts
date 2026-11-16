import { redirect } from "next/navigation";
import { apiGet, type Me } from "@/lib/api";

/** Server-side role gate for management pages. The backend still enforces manager-only on every /manager route. */
export async function managerGate(): Promise<{ ok: true; me: Me } | { ok: false; message: string }> {
  const r = await apiGet<Me>("/me");
  if (!r.ok) return { ok: false, message: r.message };
  const me = r.body.data;
  if (me.role === "manager") return { ok: true, me };
  redirect(me.role === "staff" ? "/staff" : "/dashboard");
}

/** Gate, then fetch a /manager endpoint. */
export async function managerGet<T>(path: string) {
  const g = await managerGate();
  if (!g.ok) return { ok: false as const, message: g.message };
  return apiGet<T>(path);
}
