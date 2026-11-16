import { Suspense } from "react";
import GymBusy from "@/components/GymBusy";
import { BlockSkeleton, TopSkeleton } from "@/components/member";
import {
  AnnouncementsSection,
  LoyaltySection,
  PaymentsSection,
  ProgressSection,
  ReferralSection,
  TopSection,
  UpcomingClasses,
} from "./sections";

export default function DashboardPage() {
  return (
    <div className="space-y-12">
      <Suspense fallback={<TopSkeleton />}>
        <TopSection />
      </Suspense>

      <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-12">
          <Suspense fallback={<BlockSkeleton rows={3} />}>
            <UpcomingClasses />
          </Suspense>
          <Suspense fallback={<BlockSkeleton rows={2} />}>
            <ProgressSection />
          </Suspense>
          <Suspense fallback={<BlockSkeleton rows={3} />}>
            <PaymentsSection />
          </Suspense>
        </div>
        <div className="space-y-12">
          <GymBusy />
          <Suspense fallback={<BlockSkeleton rows={3} />}>
            <AnnouncementsSection />
          </Suspense>
          <Suspense fallback={<BlockSkeleton rows={2} />}>
            <LoyaltySection />
          </Suspense>
          <Suspense fallback={<BlockSkeleton rows={1} />}>
            <ReferralSection />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
