"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { buttonClasses, inputClass } from "@/components/ui";

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

/** Date filter. Writes from and to into the URL; the server page refetches. Key it by from+to so it resets. */
export default function DateRange({ basePath, from, to }: { basePath: string; from: string; to: string }) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [err, setErr] = useState("");

  function go(a: string, b: string) {
    if (!a || !b) {
      setErr("Choose both dates.");
      return;
    }
    if (a > b) {
      setErr("The start date must not be after the end date.");
      return;
    }
    setErr("");
    router.push(`${basePath}?from=${a}&to=${b}`);
  }

  function preset(days: number) {
    const end = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
    const s = new Date(end + "T00:00:00Z");
    s.setUTCDate(s.getUTCDate() - (days - 1));
    const start = s.toISOString().slice(0, 10);
    setF(start);
    setT(end);
    go(start, end);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    go(f, t);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-3xl bg-white p-4 ring-1 ring-charcoal/5">
      <div>
        <label htmlFor="range-from" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-charcoal/60">
          From
        </label>
        <input id="range-from" type="date" value={f} onChange={(e) => setF(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="range-to" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-charcoal/60">
          To
        </label>
        <input id="range-to" type="date" value={t} onChange={(e) => setT(e.target.value)} className={inputClass} />
      </div>
      <button type="submit" className={buttonClasses("primary", "md")}>
        Apply
      </button>
      <div className="flex gap-2">
        {PRESETS.map((p) => (
          <button key={p.days} type="button" onClick={() => preset(p.days)} className={buttonClasses("ghost", "sm")}>
            Last {p.label}
          </button>
        ))}
      </div>
      {err ? (
        <p role="alert" className="w-full text-sm text-red-800">
          {err}
        </p>
      ) : null}
    </form>
  );
}
