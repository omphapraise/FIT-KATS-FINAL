"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Award,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Dumbbell,
  Gift,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageCircle,
  User,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/classes", label: "Classes", icon: CalendarDays },
  { href: "/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/programmes", label: "Programmes", icon: ClipboardList },
  { href: "/bigkat", label: "Big Kat", icon: MessageCircle },
  { href: "/loyalty", label: "Loyalty", icon: Award },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
  { href: "/referral", label: "Referrals", icon: Gift },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/report", label: "Report issue", icon: Wrench },
  { href: "/profile", label: "Profile", icon: User },
];

export default function MemberNav() {
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

  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <aside className="hidden flex-col justify-between bg-forest-deep p-8 text-ivory lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div>
          <Link href="/dashboard" className="display text-3xl">
            Fit Kats
          </Link>
          <nav aria-label="Member" className="mt-10 flex flex-col gap-1">
            {ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(href) ? "page" : undefined}
                className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                  active(href) ? "bg-ivory/10 text-ivory" : "text-ivory/70 hover:text-ivory"
                }`}
              >
                <Icon size={18} aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          className="flex items-center gap-3 rounded-full px-4 py-2.5 text-left text-sm font-medium text-ivory/70 transition-colors hover:text-ivory disabled:opacity-50"
        >
          <LogOut size={18} aria-hidden />
          Sign out
        </button>
      </aside>

      <div className="px-5 pt-6 sm:px-8 lg:hidden">
        <Link href="/dashboard" className="display text-2xl text-forest">
          Fit Kats
        </Link>
      </div>

      <div className="sticky top-0 z-40 px-3 pt-3 lg:hidden">
        <nav aria-label="Member" className="glass flex items-center gap-1 overflow-x-auto rounded-full p-1.5">
          {ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium ${
                active(href) ? "bg-forest text-ivory" : "text-charcoal"
              }`}
            >
              <Icon size={16} aria-hidden />
              {label}
            </Link>
          ))}
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium text-charcoal disabled:opacity-50"
          >
            <LogOut size={16} aria-hidden />
            Sign out
          </button>
        </nav>
      </div>
    </>
  );
}
