import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthShell({
  headline,
  blurb,
  children,
}: {
  headline: ReactNode;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative flex flex-col justify-between gap-10 overflow-hidden bg-forest px-8 py-8 text-ivory lg:px-14 lg:py-12">
        <Link href="/" className="display relative text-3xl">
          Fit Kats
        </Link>
        <div
          aria-hidden="true"
          className="absolute -bottom-40 -right-32 h-[26rem] w-[26rem] rounded-full border border-amber/50"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -right-16 h-[26rem] w-[26rem] rounded-full border border-amber/25"
        />
        <div className="relative">
          <h1 className="display text-[clamp(2.6rem,5vw,4.8rem)]">{headline}</h1>
          <p className="mt-5 max-w-sm leading-relaxed text-ivory/75">{blurb}</p>
        </div>
        <p className="relative hidden text-xs text-ivory/50 lg:block">Fit Kats. Built by Cubic Code.</p>
      </aside>
      <section className="flex items-center justify-center bg-ivory px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
