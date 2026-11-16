import { Suspense } from "react";
import WalkInForm from "@/components/WalkInForm";
import { BlockSkeleton, SectionError } from "@/components/member";
import { StaffHeader } from "@/components/staff";
import { staffGate } from "@/lib/staff";

async function Gate() {
  const g = await staffGate();
  if (!g.ok) return <SectionError title="Walk-in registration" message={g.message} />;
  return <WalkInForm />;
}

export default function WalkInPage() {
  return (
    <div className="space-y-8">
      <StaffHeader eyebrow="Front desk" title="Register a walk-in">
        Create a pending member. They set their own password with a one-time code.
      </StaffHeader>
      <Suspense fallback={<BlockSkeleton rows={4} />}>
        <Gate />
      </Suspense>
    </div>
  );
}
