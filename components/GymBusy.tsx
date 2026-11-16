"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { call } from "@/lib/client";

type Busy = { members_checked_in: number; window_minutes: number };

export default function GymBusy() {
  const [busy, setBusy] = useState<Busy | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const r = await call("GET", "/gym/busy");
      const json = r.json as unknown as { data?: Partial<Busy> } | null;
      const d = json && json.data;
      if (r.ok && d && typeof d.members_checked_in === "number" && typeof d.window_minutes === "number") {
        setBusy({ members_checked_in: d.members_checked_in, window_minutes: d.window_minutes });
        setState("ready");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section aria-label="Gym activity" className="rounded-[2rem] border border-charcoal/10 bg-white/60 p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="display text-3xl text-forest">Gym activity</h2>
        <button
          type="button"
          onClick={load}
          disabled={state === "loading"}
          aria-label="Refresh gym activity"
          className="rounded-full p-2 text-charcoal/70 transition-colors hover:text-forest disabled:opacity-40"
        >
          <RefreshCw size={16} aria-hidden />
        </button>
      </div>
      {state === "loading" && !busy ? (
        <div role="status" aria-label="Loading" className="mt-4 h-14 w-40 animate-pulse rounded-xl bg-charcoal/10 motion-reduce:animate-none" />
      ) : null}
      {state === "error" ? (
        <p role="alert" className="mt-4 text-sm text-charcoal/70">
          Gym activity is not available right now.
        </p>
      ) : null}
      {state === "ready" && busy ? (
        <div className="mt-4">
          <p className="display text-6xl text-forest">{busy.members_checked_in}</p>
          <p className="mt-2 text-sm leading-relaxed text-charcoal/75">
            {busy.members_checked_in === 1 ? "member has" : "members have"} checked in during the last {busy.window_minutes} minutes.
            This is a count of check-ins, not a measure of capacity.
          </p>
        </div>
      ) : null}
    </section>
  );
}
