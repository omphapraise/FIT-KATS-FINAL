import { Suspense } from "react";
import { BlockSkeleton, PageHeader, SectionError, SectionHead } from "@/components/member";
import { ProfileForm } from "@/components/member-actions";
import { apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";

type Profile = {
  id: number;
  email: string;
  display_name: string;
  membership_tier: string;
  membership_expiry: string;
  loyalty_points: number;
  notifications_enabled: boolean;
  total_workouts: number;
};

async function ProfileData() {
  const r = await apiGet<Profile>("/profile");
  if (!r.ok) return <SectionError title="Profile" message={r.message} />;
  const p = r.body.data;
  const facts: [string, string][] = [
    ["Email", p.email],
    ["Membership", p.membership_tier],
    ["Expires", formatDate(p.membership_expiry)],
    ["Loyalty points", String(p.loyalty_points)],
    ["Workouts logged", String(p.total_workouts)],
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
      <section>
        <SectionHead title="Your details" />
        <dl className="mt-4 divide-y divide-charcoal/10 border-y border-charcoal/10">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-3 text-sm">
              <dt className="text-charcoal/70">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-charcoal/70">Changing your tier or email is handled at the front desk.</p>
      </section>
      <section>
        <SectionHead title="Edit profile" />
        <div className="mt-4 rounded-3xl bg-white p-6 ring-1 ring-charcoal/5">
          <ProfileForm displayName={p.display_name} notifications={p.notifications_enabled} />
        </div>
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Account" title="Profile" />
      <Suspense fallback={<BlockSkeleton rows={4} />}>
        <ProfileData />
      </Suspense>
    </div>
  );
}
