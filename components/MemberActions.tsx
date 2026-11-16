"use client";

import { useState } from "react";
import { Alert, buttonClasses, Field, inputClass } from "@/components/ui";
import { call, pick, useRun } from "@/lib/client";
import { formatStamp } from "@/lib/staffData";

type Props = {
  memberId: number;
  status: string;
  inactive: boolean;
  canCheckIn: boolean;
  checkInMessage: string | null;
};

export default function MemberActions({ memberId, status, inactive, canCheckIn, checkInMessage }: Props) {
  const { run, busy, notice } = useRun();
  const [idType, setIdType] = useState("sa_id");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState<{ value: string; expires: string } | null>(null);
  const base = `/staff/members/${memberId}`;

  return (
    <div className="space-y-6">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

      <div>
        <button
          type="button"
          disabled={busy || !canCheckIn}
          onClick={() => run(() => call("POST", `${base}/checkin`))}
          className={buttonClasses("primary", "sm", "disabled:opacity-50")}
        >
          Check in now
        </button>
        {!canCheckIn ? (
          <p className="mt-2 text-sm text-charcoal/70">{checkInMessage || "This member cannot check in right now."}</p>
        ) : null}
      </div>

      {status === "pending" ? (
        <div className="space-y-4 border-t border-charcoal/10 pt-5">
          <p className="text-sm font-semibold">Verify sign-up</p>
          <Field label="ID type sighted" htmlFor="idtype" hint="Record the type only. Never enter an ID number.">
            <select id="idtype" value={idType} onChange={(e) => setIdType(e.target.value)} className={inputClass}>
              <option value="sa_id">South African ID</option>
              <option value="passport">Passport</option>
              <option value="drivers_licence">Driver&apos;s licence</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => call("POST", `${base}/verify`, { decision: "approve", id_type: idType }))}
            className={buttonClasses("primary", "sm", "disabled:opacity-50")}
          >
            Approve (30 days from today)
          </button>
          <Field label="Reason for rejecting" htmlFor="reason" hint="3 to 300 characters.">
            <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} maxLength={300} />
          </Field>
          <button
            type="button"
            disabled={busy || reason.trim().length < 3}
            onClick={() => run(() => call("POST", `${base}/verify`, { decision: "reject", reason: reason.trim() }))}
            className={buttonClasses("ghost", "sm", "disabled:opacity-50")}
          >
            Reject
          </button>
        </div>
      ) : null}

      {!inactive && status !== "rejected" ? (
        <div className="border-t border-charcoal/10 pt-5">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () => call("POST", `${base}/setup-code`),
                (r) => {
                  const v = pick(r, "setup_code");
                  if (typeof v === "string") {
                    const e = pick(r, "setup_code_expires_at");
                    setCode({ value: v, expires: typeof e === "string" ? formatStamp(e) : "" });
                  }
                }
              )
            }
            className={buttonClasses("ghost", "sm", "disabled:opacity-50")}
          >
            Issue a new setup code
          </button>
          {code ? (
            <div className="mt-4 rounded-2xl bg-ivory p-4 ring-1 ring-charcoal/10">
              <p className="select-all font-mono text-2xl font-semibold tracking-[0.2em]">{code.value}</p>
              <p className="mt-2 text-xs text-charcoal/70">
                Shown once. Give it to the member so they can set their own password at /activate.
                {code.expires ? ` Expires ${code.expires}.` : ""}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
