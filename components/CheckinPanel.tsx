"use client";

import { useState, type FormEvent } from "react";
import { Alert, buttonClasses, inputClass } from "@/components/ui";
import { call, useRun } from "@/lib/client";

export default function CheckinPanel() {
  const { run, busy, notice } = useRun();
  const [token, setToken] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    await run(() => call("POST", "/staff/checkin/scan", { token: t }));
    setToken("");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label htmlFor="scan" className="block text-sm font-semibold">
        Member check-in code
      </label>
      <input
        id="scan"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        className={inputClass}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="Scan or paste the code from the member's screen"
      />
      <button type="submit" disabled={busy || !token.trim()} className={buttonClasses("primary", "md", "disabled:opacity-50")}>
        {busy ? "Checking in..." : "Check in"}
      </button>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <p className="text-xs leading-relaxed text-charcoal/70">
        A handheld scanner types the code and presses Enter. Camera scanning is not built yet. Codes last one minute.
      </p>
    </form>
  );
}
