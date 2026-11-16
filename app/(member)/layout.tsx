import type { ReactNode } from "react";
import MemberNav from "@/components/MemberNav";

export default function MemberLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ivory text-charcoal lg:grid lg:grid-cols-[15rem_1fr]">
      <MemberNav />
      <main className="px-5 pb-28 pt-8 sm:px-8 lg:px-12 lg:pb-16 lg:pt-12">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
