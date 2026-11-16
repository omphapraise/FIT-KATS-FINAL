import type { ReactNode } from "react";
import StaffNav from "@/components/StaffNav";

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ivory text-charcoal lg:grid lg:grid-cols-[15rem_1fr]">
      <StaffNav />
      <main className="px-5 pb-16 pt-6 sm:px-8 lg:px-10 lg:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
