"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Send } from "lucide-react";
import { call } from "@/lib/client";
import { Loose, isObj, list, str, type Obj } from "@/components/Loose";

type Msg = { id: number; role: "me" | "kat"; text?: string; data?: Obj };

const STARTERS = ["How do I do a squat?", "How much protein do I need?", "How often should I train?"];

function Card({ tone, children }: { tone: "plain" | "amber" | "red"; children: ReactNode }) {
  const cls =
    tone === "red"
      ? "border-red-800/40 bg-red-50"
      : tone === "amber"
        ? "border-amber bg-amber/10"
        : "border-charcoal/10 bg-white";
  return <div className={`space-y-3 rounded-2xl border p-5 text-sm leading-relaxed text-charcoal ${cls}`}>{children}</div>;
}

function Choices({ items, onAsk, disabled }: { items: Obj[]; onAsk: (q: string) => void; disabled: boolean }) {
  const rows = items.filter((i) => str(i.question));
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((i, n) => (
        <li key={`${str(i.id)}-${n}`}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAsk(str(i.question))}
            className="rounded-full border border-forest/30 px-4 py-2 text-left text-sm font-medium text-forest transition-colors hover:bg-forest hover:text-ivory disabled:opacity-50"
          >
            {str(i.question)}
          </button>
        </li>
      ))}
    </ul>
  );
}

function KatReply({ data, onAsk, disabled }: { data: Obj; onAsk: (q: string) => void; disabled: boolean }) {
  const type = str(data.type);

  if (type === "safety") {
    const primary = isObj(data.primary) ? data.primary : {};
    const emergency = str(data.severity) === "emergency";
    const resourcesNote = str(data.local_emergency_resources_note);
    return (
      <Card tone={emergency ? "red" : "amber"}>
        <p className="text-xs font-semibold uppercase tracking-[0.14em]">{str(data.severity_label) || "Safety"}</p>
        <p className="text-base font-semibold">{str(primary.message)}</p>
        {data.stop_exercising === true ? <p className="font-semibold">Stop exercising until this has been checked.</p> : null}
        {data.local_emergency_resources ? <Loose value={data.local_emergency_resources} /> : null}
        {resourcesNote ? <p className="text-charcoal/75">{resourcesNote}</p> : null}
      </Card>
    );
  }

  if (type === "faq") {
    const p = isObj(data.primary) ? data.primary : {};
    const note = str(data.note);
    const related = list(data.related).filter(isObj);
    return (
      <Card tone="plain">
        {note ? <p className="text-charcoal/70">{note}</p> : null}
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-forest">{str(p.question)}</p>
        <p className="text-base font-semibold">{str(p.short_answer)}</p>
        {str(p.detailed_explanation) ? <p>{str(p.detailed_explanation)}</p> : null}
        {str(p.practical_recommendation) ? (
          <p>
            <span className="font-semibold">Try this: </span>
            {str(p.practical_recommendation)}
          </p>
        ) : null}
        {str(p.misconception) ? (
          <p>
            <span className="font-semibold">Common myth: </span>
            {str(p.misconception)}
          </p>
        ) : null}
        {str(p.warning) ? <p className="font-semibold text-brown">{str(p.warning)}</p> : null}
        {related.length > 0 ? (
          <div className="space-y-2 border-t border-charcoal/10 pt-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-charcoal/65">Related</p>
            <Choices items={related} onAsk={onAsk} disabled={disabled} />
          </div>
        ) : null}
      </Card>
    );
  }

  if (type === "clarification") {
    return (
      <Card tone="plain">
        <p className="font-semibold">{str(data.message)}</p>
        <Choices items={list(data.options).filter(isObj)} onAsk={onAsk} disabled={disabled} />
      </Card>
    );
  }

  if (type === "exercise") {
    const resolution = isObj(data.resolution) ? data.resolution : {};
    const exercises = list(data.exercises).filter(isObj);
    return (
      <Card tone="plain">
        {exercises.length === 0 ? <p className="font-semibold">{str(data.message)}</p> : null}
        {str(resolution.note) ? <p className="text-charcoal/75">{str(resolution.note)}</p> : null}
        {exercises.map((e, i) => (
          <div key={`${str(e.id)}-${i}`} className="space-y-2 rounded-xl border border-charcoal/10 p-4">
            <p className="display text-2xl text-forest">{str(e.name)}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-charcoal/65">
              {e.verified_guidance === true ? "Verified guidance" : "Guidance pending review"}
              {str(e.guidance_label) ? ` · ${str(e.guidance_label)}` : ""}
            </p>
            {e.equipment ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-charcoal/65">Equipment</p>
                <Loose value={e.equipment} />
              </div>
            ) : null}
            {e.execution ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-charcoal/65">How to do it</p>
                <Loose value={e.execution} />
              </div>
            ) : (
              <p className="text-charcoal/70">No reviewed technique text is available for this exercise yet.</p>
            )}
            {e.safety ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-charcoal/65">Safety</p>
                <Loose value={e.safety} />
              </div>
            ) : null}
          </div>
        ))}
      </Card>
    );
  }

  return (
    <Card tone="plain">
      <p>{str(data.message) || "I couldn't find that. Try rephrasing it."}</p>
    </Card>
  );
}

export default function BigKatChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastFaq, setLastFaq] = useState<string | null>(null);
  const counter = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy]);

  async function send(raw: string) {
    const text = raw.trim();
    if (text.length < 2 || busy) return;
    const meId = ++counter.current;
    setMsgs((m) => [...m, { id: meId, role: "me", text }]);
    setInput("");
    setBusy(true);
    const r = await call("POST", "/fitness-ai/ask", {
      message: text,
      context: lastFaq ? { last_faq_id: lastFaq } : undefined,
    });
    setBusy(false);
    const katId = ++counter.current;
    const data = r.json?.data;
    if (r.ok && isObj(data)) {
      if (str(data.type) === "faq" && isObj(data.primary) && str(data.primary.id)) setLastFaq(str(data.primary.id));
      setMsgs((m) => [...m, { id: katId, role: "kat", data }]);
    } else {
      setMsgs((m) => [...m, { id: katId, role: "kat", text: r.message }]);
    }
  }

  return (
    <div className="flex h-[70vh] min-h-[30rem] flex-col rounded-[2rem] border border-charcoal/10 bg-white/60">
      <div role="log" aria-live="polite" className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
        {msgs.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-charcoal/75">Ask a fitness question, or start with one of these.</p>
            <ul className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-forest/30 px-4 py-2 text-sm font-medium text-forest transition-colors hover:bg-forest hover:text-ivory"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {msgs.map((m) =>
          m.role === "me" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl bg-forest px-4 py-2.5 text-sm text-ivory">{m.text}</p>
            </div>
          ) : (
            <div key={m.id} className="max-w-[95%]">
              {m.data ? (
                <KatReply data={m.data} onAsk={send} disabled={busy} />
              ) : (
                <p role="alert" className="rounded-2xl border border-charcoal/15 bg-white p-4 text-sm text-charcoal/80">
                  {m.text}
                </p>
              )}
            </div>
          )
        )}
        {busy ? (
          <p role="status" className="text-sm text-charcoal/65">
            Big Kat is looking this up...
          </p>
        ) : null}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-charcoal/10 p-3"
      >
        <label htmlFor="bigkat-input" className="sr-only">
          Your question
        </label>
        <input
          id="bigkat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          autoComplete="off"
          placeholder="Ask Big Kat..."
          className="min-w-0 flex-1 rounded-full border border-charcoal/20 bg-white px-5 py-3 text-sm text-charcoal focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/30"
        />
        <button
          type="submit"
          disabled={busy || input.trim().length < 2}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest text-ivory transition-colors hover:bg-forest-deep disabled:opacity-40"
        >
          <Send size={18} aria-hidden />
        </button>
      </form>
    </div>
  );
}
