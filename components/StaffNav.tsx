"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  CalendarDays,
  Gauge,
  LogOut,
  Megaphone,
  ScanLine,
  ScrollText,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ITEMS: { href: string; label: string; icon: LucideIcon; exact?: boolean; managerOnly?: boolean }[] = [
  { href: "/staff", label: "Front desk", icon: ScanLine, exact: true },
  { href: "/staff/members", label: "Members", icon: Users },
  { href: "/staff/walk-in", label: "Walk-in", icon: UserPlus },
  { href: "/staff/classes", label: "Classes", icon: CalendarDays },
  { href: "/staff/reports", label: "Maintenance", icon: Wrench },
  { href: "/staff/announcements", label: "Announcements", icon: Megaphone },
  { href: "/staff/audit", label: "Audit log", icon: ScrollText, managerOnly: true },
];

export default function StaffNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isManager, setIsManager] = useState(false);

  // Convenience only: shows manager links. The backend enforces the role on every /manager and audit route.
  useEffect(() => {
    let live = true;
    fetch("/api/backend/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live && j && j.data && j.data.role === "manager") setIsManager(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const items = ITEMS.filter((i) => !i.managerOnly || isManager);
  const active = (i: (typeof ITEMS)[number]) =>
    i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/");

  return (
    <>
      <aside className="hidden flex-col justify-between bg-charcoal p-6 text-ivory lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div>
          <Link href="/staff" className="display text-3xl">
            Fit Kats
          </Link>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber">Staff workspace</p>
          <nav aria-label="Staff" className="mt-10 flex flex-col gap-1">
            {items.map((i) => (
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
          {isManager ? (
            <Link
              href="/manager"
              className="flex items-center gap-3 rounded-full bg-forest px-4 py-2.5 text-sm font-semibold text-ivory transition-colors hover:bg-forest-deep"
            >
              <Gauge size={18} aria-hidden className="text-amber" />
              Management
            </Link>
          ) : null}
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

      <div className="sticky top-0 z-40 bg-charcoal text-ivory lg:hidden">
        <div className="flex items-center justify-between px-5 pt-3">
          <Link href="/staff" className="display text-2xl">
            Fit Kats <span className="text-amber">Staff</span>
          </Link>
          <button type="button" onClick={signOut} disabled={busy} aria-label="Sign out" className="p-2 text-ivory/80">
            <LogOut size={18} aria-hidden />
          </button>
        </div>
        <nav aria-label="Staff" className="flex gap-1 overflow-x-auto px-4 pb-3 pt-2">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active(i) ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${
                active(i) ? "bg-ivory text-charcoal" : "text-ivory/75"
              }`}
            >
              {i.label}
            </Link>
          ))}
          {isManager ? (
            <Link href="/manager" className="whitespace-nowrap rounded-full bg-forest px-3.5 py-1.5 text-sm font-semibold text-ivory">
              Management
            </Link>
          ) : null}
        </nav>
      </div>
    </>
  );
}
