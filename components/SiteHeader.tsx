"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { ButtonLink } from "@/components/ui";

const links = [
  { href: "#experience", label: "Experience" },
  { href: "#bigkat", label: "Big Kat" },
  { href: "#membership", label: "Membership" },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <div className="glass mx-auto flex max-w-5xl items-center justify-between rounded-full px-5 py-2.5">
        <Link href="/" className="display text-2xl text-forest">
          Fit Kats
        </Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-charcoal/80 transition hover:text-forest"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink href="/login" size="sm">
            Sign in
          </ButtonLink>
          <button
            type="button"
            className="rounded-full p-2 text-charcoal md:hidden"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="glass mx-auto mt-2 max-w-5xl rounded-3xl p-3 md:hidden" aria-label="Mobile">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-2xl px-4 py-3 text-base font-medium text-charcoal hover:bg-forest/10"
            >
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
