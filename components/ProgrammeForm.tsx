"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { call, pick } from "@/lib/client";
import { Loose, isObj, list, str, type Obj } from "@/components/Loose";

const GOALS: [string, string][] = [
  ["muscle_gain", "Build muscle"],
  ["strength", "Get stronger"],
  ["fat_loss", "Lose fat"],
  ["general_fitness", "General fitness"],
  ["endurance", "Endurance"],
  ["sport_performance", "Sport performance"],
  ["mobility_function", "Mobility and function"],
  ["powerlifting", "Powerlifting"],
];
const EXPERIENCE: [string, string][] = [
  ["beginner", "Beginner"],
  ["intermediate", "Intermediate"],
  ["advanced", "Advanced"],
  ["returning", "Returning after a break"],
];
const AGES: [string, string][] = [
  ["under_18", "Under 18"],
  ["18_64", "18 to 64"],
  ["65_plus", "65 or older"],
];
const EQUIPMENT: [string, string][] = [
  ["full_gym", "Full gym"],
  ["barbell", "Barbell and rack"],
  ["home_dumbbells", "Dumbbells at home"],
  ["bodyweight", "Bodyweight only"],
  ["bands", "Resistance bands"],
];
const PREGNANCY: [string, string][] = [
  ["none", "Not applicable"],
  ["pregnant", "Pregnant"],
  ["postpartum", "Postpartum"],
];

const fieldCls =
  "mt-1 w-full rounded-xl border border-charcoal/20 bg-white px-3 py-2.5 text-sm text-charcoal focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/30";
const labelCls = "block text-sm font-semibold text-charcoal";

function Sel({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className={labelCls}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ProgrammeForm() {
  const router = useRouter();
  const [goal, setGoal] = useState("general_fitness");
  const [experience, setExperience] = useState("beginner");
  const [age, setAge] = useState("18_64");
  const [days, setDays] = useState("3");
  const [equipment, setEquipment] = useState("full_gym");
  const [minutes, setMinutes] = useState("");
  const [pregnancy, setPregnancy] = useState("none");
  const [health, setHealth] = useState(false);
  const [limitations, setLimitations] = useState("");
  const [sport, setSport] = useState("");
  const [dislikes, setDislikes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [result, setResult] = useState<Obj | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setProblems([]);
    setResult(null);

    const body: Record<string, unknown> = {
      goal,
      experience,
      age_band: age,
      days_per_week: Number(days),
      equipment,
      pregnancy_status: pregnancy,
      health_condition: health,
    };
    if (minutes.trim()) body.session_minutes = Number(minutes);
    if (limitations.trim()) body.limitations = limitations.trim();
    if (goal === "sport_performance" && sport.trim()) body.sport = sport.trim();
    const dl = dislikes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (dl.length) body.dislikes = dl;

    const r = await call("POST", "/programmes/generate", body);
    setBusy(false);

    if (!r.ok) {
      setError(r.message);
      setProblems(list(r.json?.errors).filter((x): x is string => typeof x === "string"));
      return;
    }
    if (pick(r, "saved") === true) {
      const id = pick(r, "saved_id");
      router.push(`/programmes/${String(id)}`);
      router.refresh();
      return;
    }
    const data = r.json?.data;
    setResult(isObj(data) ? data : { message: r.message });
  }

  const resultType = result ? str(result.type) : "";
  const resultTone = resultType === "stop" ? "border-red-800/40 bg-red-50" : "border-amber bg-amber/10";

  return (
    <form onSubmit={submit} className="space-y-5 rounded-[2rem] border border-charcoal/10 bg-white/60 p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Sel label="Main goal" value={goal} onChange={setGoal} options={GOALS} />
        <Sel label="Experience" value={experience} onChange={setExperience} options={EXPERIENCE} />
        <Sel label="Age" value={age} onChange={setAge} options={AGES} />
        <Sel label="Equipment" value={equipment} onChange={setEquipment} options={EQUIPMENT} />
        <label className={labelCls}>
          Days per week (2 to 6)
          <input type="number" min={2} max={6} required value={days} onChange={(e) => setDays(e.target.value)} className={fieldCls} />
        </label>
        <label className={labelCls}>
          Session length in minutes (optional)
          <input type="number" min={20} max={180} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={fieldCls} />
        </label>
      </div>

      {goal === "sport_performance" ? (
        <label className={labelCls}>
          Which sport?
          <input value={sport} maxLength={40} onChange={(e) => setSport(e.target.value)} className={fieldCls} />
          <span className="mt-1 block text-xs font-normal text-charcoal/70">Big Kat covers football and running only.</span>
        </label>
      ) : null}

      <Sel label="Pregnancy status" value={pregnancy} onChange={setPregnancy} options={PREGNANCY} />

      <label className="flex items-start gap-3 text-sm text-charcoal">
        <input type="checkbox" checked={health} onChange={(e) => setHealth(e.target.checked)} className="mt-1 h-4 w-4 accent-forest" />
        <span>I have a known health condition. Big Kat will flag that your clinician should confirm the plan.</span>
      </label>

      <label className={labelCls}>
        Injuries or limitations (optional)
        <textarea value={limitations} maxLength={300} rows={3} onChange={(e) => setLimitations(e.target.value)} className={fieldCls} />
      </label>

      <label className={labelCls}>
        Exercises you dislike (optional, comma separated, up to 10)
        <input value={dislikes} onChange={(e) => setDislikes(e.target.value)} className={fieldCls} />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-forest px-6 py-3 text-sm font-semibold text-ivory transition-colors hover:bg-forest-deep disabled:opacity-50"
      >
        {busy ? "Generating..." : "Generate and save programme"}
      </button>
      <p className="text-xs leading-relaxed text-charcoal/70">
        Rule-based: Big Kat selects and adapts a written programme from its knowledge base. It does not invent exercises, sets or reps, and
        it is not medical advice.
      </p>

      {error ? (
        <div role="alert" className="rounded-2xl border border-charcoal/15 bg-white p-4 text-sm text-charcoal">
          <p className="font-semibold">{error}</p>
          {problems.length > 1 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-charcoal/80">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div role="status" className={`space-y-3 rounded-2xl border p-5 text-sm leading-relaxed text-charcoal ${resultTone}`}>
          {str(result.severity_label) ? (
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">{str(result.severity_label)}</p>
          ) : null}
          <p className="text-base font-semibold">{str(result.message)}</p>
          {result.stop_exercising === true ? <p className="font-semibold">Do not start training until this has been checked.</p> : null}
          {result.local_emergency_resources ? <Loose value={result.local_emergency_resources} /> : null}
          {str(result.local_emergency_resources_note) ? <p className="text-charcoal/75">{str(result.local_emergency_resources_note)}</p> : null}
          <p className="text-charcoal/75">Nothing was saved.</p>
        </div>
      ) : null}
    </form>
  );
}
