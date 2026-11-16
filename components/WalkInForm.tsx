"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, buttonClasses, Field, inputClass } from "@/components/ui";
import { call, pick, useRun } from "@/lib/client";
import { formatStamp } from "@/lib/staffData";

type Created = { code: string; expires: string; memberId: number | null };

export default function WalkInForm() {
  const { run, busy, notice } = useRun();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [tier, setTier] = useState("Silver");
  const [created, setCreated] = useState<Created | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, string> = { display_name: name.trim(), email: email.trim(), membership_tier: tier };
    if (phone.trim()) body.phone = phone.trim();
    await run(
      () => call("POST", "/staff/members", body),
      (r) => {
        const code = pick(r, "setup_code");
        const exp = pick(r, "setup_code_expires_at");
        const m = pick(r, "member");
        const id = m && typeof m === "object" ? (m as { id?: unknown }).id : null;
        setCreated({
          code: typeof code === "string" ? code : "",
          expires: typeof exp === "string" ? formatStamp(exp) : "",
          memberId: typeof id === "number" ? id : null,
        });
        setName("");
        setEmail("");
        setPhone("");
      }
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <form onSubmit={submit} className="space-y-5 rounded-3xl bg-white p-6 ring-1 ring-charcoal/5">
        <Field label="Full name" htmlFor="wn">
          <input id="wn" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required minLength={2} maxLength={40} />
        </Field>
        <Field label="Email" htmlFor="we">
          <input id="we" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
        </Field>
        <Field label="Phone (optional)" htmlFor="wp">
          <input id="wp" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Membership tier" htmlFor="wt">
          <select id="wt" value={tier} onChange={(e) => setTier(e.target.value)} className={inputClass}>
            <option>Silver</option>
            <option>Gold</option>
            <option>Platinum</option>
          </select>
        </Field>
        <button type="submit" disabled={busy} className={buttonClasses("primary", "md", "disabled:opacity-50")}>
          {busy ? "Registering..." : "Register walk-in"}
        </button>
        {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      </form>

      <div className="rounded-3xl bg-forest p-6 text-ivory">
        {created ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber">Setup code (shown once)</p>
            <p className="mt-3 select-all font-mono text-3xl font-semibold tracking-[0.2em]">{created.code || "Not returned"}</p>
            <p className="mt-3 text-sm leading-relaxed text-ivory/85">
              Give this to the member. They set their own password at /activate.
              {created.expires ? ` It expires ${created.expires}.` : ""} The membership stays pending until you verify their ID.
            </p>
            {created.memberId ? (
              <Link href={`/staff/members/${created.memberId}`} className={buttonClasses("light", "sm", "mt-5")}>
                Open profile to verify
              </Link>
            ) : null}
          </>
        ) : (
          <>
            <h2 className="display text-3xl">How walk-ins work</h2>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed text-ivory/85">
              <li>1. Register the member here. They are created as pending.</li>
              <li>2. Give them the one-time setup code. They choose their own password.</li>
              <li>3. Sight their ID, record the type only, and approve on their profile.</li>
              <li>4. Membership starts on approval and runs 30 days. The R200 sign-up fee is a demonstration record.</li>
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
