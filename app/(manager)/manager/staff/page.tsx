import { Suspense } from "react";
import { StaffHeader, Pill } from "@/components/staff";
import { EmptyNote, ErrorPanel, SectionSkeleton } from "@/components/manager";
import { managerGet } from "@/lib/manager";
import type { StaffRow } from "@/lib/managerData";

async function TeamTable() {
  const r = await managerGet<StaffRow[]>("/manager/staff");
  if (!r.ok) return <ErrorPanel message={r.message} />;
  const rows = r.body.data;
  if (rows.length === 0) return <EmptyNote>No staff accounts yet.</EmptyNote>;

  return (
    <div className="overflow-x-auto rounded-3xl bg-white p-2 ring-1 ring-charcoal/5">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead>
          <tr className="border-b border-charcoal/10 text-xs uppercase tracking-wide text-charcoal/60">
            <th scope="col" className="px-4 py-3 font-semibold">Name</th>
            <th scope="col" className="px-4 py-3 font-semibold">Role</th>
            <th scope="col" className="px-4 py-3 font-semibold">Status</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">Open reports</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-charcoal/5 last:border-0">
              <td className="px-4 py-3">
                <p className="font-semibold text-charcoal">{s.display_name}</p>
                <p className="text-xs text-charcoal/65">{s.email}</p>
              </td>
              <td className="px-4 py-3">
                <Pill tone={s.role === "manager" ? "ok" : "muted"}>{s.role === "manager" ? "Manager" : "Staff"}</Pill>
              </td>
              <td className="px-4 py-3">
                <Pill tone={s.is_active ? "ok" : "bad"}>{s.is_active ? "Active" : "Deactivated"}</Pill>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{s.open_reports}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ManagerTeamPage() {
  return (
    <>
      <StaffHeader eyebrow="Management" title="Team">
        Everyone with staff or manager access, and how many unresolved maintenance reports each is assigned. Roles are
        changed by an administrator outside the website for now.
      </StaffHeader>
      <div className="mt-8">
        <Suspense fallback={<SectionSkeleton />}>
          <TeamTable />
        </Suspense>
      </div>
    </>
  );
}
