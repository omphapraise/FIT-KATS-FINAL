import { redirect } from "next/navigation";
import { apiGet, type Me } from "@/lib/api";

/** Server-side role gate for staff pages. The backend still enforces roles on every /staff route. */
export async function staffGate(): Promise<{ ok: true; me: Me } | { ok: false; message: string }> {
  const r = await apiGet<Me>("/me");
  if (!r.ok) return { ok: false, message: r.message };
  const me = r.body.data;
  if (me.role !== "staff" && me.role !== "manager") redirect("/dashboard");
  return { ok: true, me };
}
