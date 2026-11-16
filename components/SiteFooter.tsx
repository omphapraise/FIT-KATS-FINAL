import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="bg-forest-deep text-ivory">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="display text-5xl">Fit Kats</p>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ivory/70">
            A gym membership that feels like it belongs to you.
          </p>
        </div>
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-amber">Explore</p>
          <ul className="space-y-2 text-sm text-ivory/80">
            <li><a href="#experience" className="hover:text-amber">Experience</a></li>
            <li><a href="#bigkat" className="hover:text-amber">Big Kat</a></li>
            <li><a href="#membership" className="hover:text-amber">Membership</a></li>
          </ul>
        </div>
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-amber">Members</p>
          <ul className="space-y-2 text-sm text-ivory/80">
            <li><Link href="/login" className="hover:text-amber">Sign in</Link></li>
            <li>New here? Register at the front desk.</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ivory/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-ivory/55 sm:flex-row sm:justify-between">
          <span>Fit Kats. Built by Cubic Code.</span>
          <span>Payments on this platform are a demonstration. No card details are collected.</span>
        </div>
      </div>
    </footer>
  );
}
