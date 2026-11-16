"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/lib/client";
import { Loose, isObj, list, str, type Obj } from "@/components/Loose";

export function DeleteProgrammeButton({ id, goToList }: { id: number; goToList?: boolean }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const r = await call("DELETE", `/programmes/${id}`);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      setArmed(false);
      return;
    }
    if (goToList) router.push("/programmes");
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {armed ? (
        <span className="inline-flex gap-2">
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-full bg-red-800 px-4 py-1.5 text-xs font-semibold text-ivory disabled:opacity-50"
          >
            {busy ? "Deleting..." : "Confirm delete"}
          </button>
          <button type="button" onClick={() => setArmed(false)} disabled={busy} className="rounded-full px-3 py-1.5 text-xs font-semibold text-charcoal/75">
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="rounded-full border border-charcoal/20 px-4 py-1.5 text-xs font-semibold text-charcoal/80 transition-colors hover:border-red-800 hover:text-red-800"
        >
          Delete
        </button>
      )}
      {error ? (
        <span role="alert" className="text-xs text-red-800">
          {error}
        </span>
      ) : null}
    </span>
  );
}

const FEEDBACK: [string, string][] = [
  ["too_hard", "It feels too hard"],
  ["too_easy", "It feels too easy"],
  ["missed_sessions", "I missed sessions"],
  ["time_short", "I am short on time"],
  ["pain", "Something hurts"],
];

const BASIS: Record<string, string> = {
  programme: "From the programme",
  source_gap: "Not stated in the source",
  engineering_default: "General default",
  design: "How Big Kat works",
};

export function AdaptPanel({ id }: { id: number }) {
  const [feedback, setFeedback] = useState("too_hard");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Obj | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    setResult(null);
    const body: Record<string, unknown> = { feedback };
    if (note.trim()) body.note = note.trim();
    const r = await call("POST", `/programmes/${id}/adapt`, body);
    setBusy(false);
    const data = r.json?.data;
    if (r.ok && isObj(data)) setResult(data);
    else setError(r.message);
  }

  const stop = result ? str(result.type) === "stop" : false;
  const guidance = result ? list(result.guidance).filter(isObj) : [];

  return (
    <div className="space-y-4 rounded-[2rem] border border-charcoal/10 bg-white/60 p-6">
      <p className="text-sm leading-relaxed text-charcoal/75">
        Get advice on how to handle this programme. Your saved plan is never changed, and loads are never raised for you.
      </p>
      <label className="block text-sm font-semibold text-charcoal">
        What is happening?
        <select
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className="mt-1 w-full rounded-xl border border-charcoal/20 bg-white px-3 py-2.5 text-sm font-normal focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/30"
        >
          {FEEDBACK.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold text-charcoal">
        Anything to add? (optional)
        <textarea
          value={note}
          maxLength={300}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 w-full rounded-xl border border-charcoal/20 bg-white px-3 py-2.5 text-sm font-normal focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
      </label>
      <button
        type="button"
        onClick={ask}
        disabled={busy}
        className="rounded-full bg-forest px-6 py-3 text-sm font-semibold text-ivory transition-colors hover:bg-forest-deep disabled:opacity-50"
      >
        {busy ? "Checking..." : "Get advice"}
      </button>

      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {result && stop ? (
        <div role="status" className="space-y-2 rounded-2xl border border-red-800/40 bg-red-50 p-5 text-sm leading-relaxed text-charcoal">
          {str(result.severity_label) ? <p className="text-xs font-semibold uppercase tracking-[0.14em]">{str(result.severity_label)}</p> : null}
          <p className="text-base font-semibold">{str(result.message)}</p>
          {result.stop_exercising === true ? <p className="font-semibold">Stop exercising until this has been checked.</p> : null}
          {result.local_emergency_resources ? <Loose value={result.local_emergency_resources} /> : null}
        </div>
      ) : null}

      {result && !stop ? (
        <ul role="status" className="space-y-3 rounded-2xl border border-charcoal/10 bg-white p-5 text-sm leading-relaxed text-charcoal">
          {guidance.map((g, i) => (
            <li key={i}>
              <p>{str(g.text)}</p>
              {BASIS[str(g.basis)] ? <p className="mt-0.5 text-xs text-charcoal/65">{BASIS[str(g.basis)]}</p> : null}
            </li>
          ))}
          {guidance.length === 0 ? <li>No advice came back for that.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
