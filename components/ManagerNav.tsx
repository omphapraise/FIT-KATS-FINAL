"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  Banknote,
  LayoutDashboard,
  LogOut,
  ScanLine,
  ScrollText,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ITEMS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/manager", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/manager/membership", label: "Membership", icon: Users },
  { href: "/manager/revenue", label: "Revenue", icon: Banknote },
  { href: "/manager/attendance", label: "Attendance", icon: Activity },
  { href: "/manager/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/manager/staff", label: "Team", icon: ShieldCheck },
  { href: "/manager/audit", label: "Audit log", icon: ScrollText },
];

export default function ManagerNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const active = (i: (typeof ITEMS)[number]) =>
    i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/");

  return (
    <>
      <aside className="hidden flex-col justify-between bg-forest-deep p-6 text-ivory lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div>
          <Link href="/manager" className="display text-3xl">
            Fit Kats
          </Link>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber">Management</p>
          <nav aria-label="Management" className="mt-10 flex flex-col gap-1">
            {ITEMS.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active(i) ? "page" : undefined}
                className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                  active(i) ? "bg-ivory/10 text-ivory" : "text-ivory/70 hover:text-ivory"
                }`}
              >
                <i.icon size={18} aria-hidden className={active(i) ? "text-amber" : ""} />
                {i.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-1">
          <Link
            href="/staff"
            className="flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-ivory/70 transition-colors hover:text-ivory"
          >
            <ScanLine size={18} aria-hidden />
            Staff workspace
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-ivory/70 transition-colors hover:text-ivory"
          >
            <ArrowLeftRight size={18} aria-hidden />
            Member view
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="flex items-center gap-3 rounded-full px-4 py-2.5 text-left text-sm font-medium text-ivory/70 transition-colors hover:text-ivory disabled:opacity-50"
          >
            <LogOut size={18} aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      <div className="sticky top-0 z-40 bg-forest-deep text-ivory lg:hidden">
        <div className="flex items-center justify-between px-5 pt-3">
          <Link href="/manager" className="display text-2xl">
            Fit Kats <span className="text-amber">Management</span>
          </Link>
          <button type="button" onClick={signOut} disabled={busy} aria-label="Sign out" className="p-2 text-ivory/80">
            <LogOut size={18} aria-hidden />
          </button>
        </div>
        <nav aria-label="Management" className="flex gap-1 overflow-x-auto px-4 pb-3 pt-2">
          {ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active(i) ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${
                active(i) ? "bg-ivory text-forest-deep" : "text-ivory/75"
              }`}
            >
              {i.label}
            </Link>
          ))}
          <Link href="/staff" className="whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium text-ivory/75">
            Staff workspace
          </Link>
        </nav>
      </div>
    </>
  );
}
