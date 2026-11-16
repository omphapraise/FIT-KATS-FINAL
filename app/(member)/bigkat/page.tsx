import BigKatChat from "@/components/BigKatChat";
import { PageHeader } from "@/components/member";

export default function BigKatPage() {
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Fitness answers" title="Big Kat">
        Ask about training, technique and recovery. Big Kat is rule-based: it matches your question to written Fit Kats answers. It is not
        generative AI and not medical advice, and nothing you type is saved.
      </PageHeader>
      <BigKatChat />
    </div>
  );
}
