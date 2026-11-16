"use client";

import { useState, type FormEvent } from "react";
import { Alert, buttonClasses, Field, inputClass } from "@/components/ui";
import { call, useRun } from "@/lib/client";

export function WorkoutForm() {
  const { run, busy, notice } = useRun();
  const [name, setName] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("0");
  const [date, setDate] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      exercise_name: name.trim(),
      sets: Number(sets),
      reps: Number(reps),
      weight: Number(weight),
    };
    if (date) body.date = date;
    await run(() => call("POST", "/add-workout", body), () => setName(""));
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-3xl bg-white p-6 ring-1 ring-charcoal/5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Exercise (2 to 50 characters)" htmlFor="wn">
          <input id="wn" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required minLength={2} maxLength={50} placeholder="Back squat" />
        </Field>
      </div>
      <Field label="Sets (1 to 20)" htmlFor="ws">
        <input id="ws" type="number" min={1} max={20} value={sets} onChange={(e) => setSets(e.target.value)} className={inputClass} required />
      </Field>
      <Field label="Reps (1 to 100)" htmlFor="wr">
        <input id="wr" type="number" min={1} max={100} value={reps} onChange={(e) => setReps(e.target.value)} className={inputClass} required />
      </Field>
      <Field label="Weight in kg (0 to 500)" htmlFor="ww">
        <input id="ww" type="number" min={0} max={500} step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClass} required />
      </Field>
      <Field label="Date" htmlFor="wd" hint="Leave empty for today.">
        <input id="wd" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className={buttonClasses("primary", "md", "disabled:opacity-50")}>
          {busy ? "Saving..." : "Log workout"}
        </button>
        {notice ? (
          <div className="mt-4">
            <Alert tone={notice.tone}>{notice.text}</Alert>
          </div>
        ) : null}
      </div>
    </form>
  );
}

export function DeleteWorkoutButton({ id }: { id: number }) {
  const { run, busy, notice } = useRun();
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (window.confirm("Delete this workout? Points already earned stay on your balance.")) {
            run(() => call("DELETE", `/workouts/${id}`));
          }
        }}
        className={buttonClasses("ghost", "sm", "disabled:opacity-50")}
      >
        {busy ? "Deleting..." : "Delete"}
      </button>
      {notice && notice.tone === "error" ? <p role="alert" className="mt-2 text-sm text-red-800">{notice.text}</p> : null}
    </div>
  );
}

export function MarkReadButton({ id }: { id: number }) {
  const { run, busy, notice } = useRun();
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={() => run(() => call("POST", `/announcements/${id}/read`))}
        className={buttonClasses("ghost", "sm", "disabled:opacity-50")}
      >
        {busy ? "Working..." : "Mark as read"}
      </button>
      {notice && notice.tone === "error" ? <p role="alert" className="mt-2 text-sm text-red-800">{notice.text}</p> : null}
    </div>
  );
}

export function RedeemForm() {
  const { run, busy, notice } = useRun();
  const [code, setCode] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(() => call("POST", "/referral/redeem", { code: code.trim().toUpperCase() }), () => setCode(""));
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Friend's referral code" htmlFor="rc" hint="8 letters or numbers. You can enter one code, before your first check-in.">
        <input
          id="rc"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className={inputClass}
          required
          minLength={8}
          maxLength={8}
          pattern="[A-Za-z0-9]{8}"
          autoComplete="off"
        />
      </Field>
      <button type="submit" disabled={busy || code.length !== 8} className={buttonClasses("primary", "sm", "disabled:opacity-50")}>
        {busy ? "Checking..." : "Use code"}
      </button>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
    </form>
  );
}

export function ProfileForm({ displayName, notifications }: { displayName: string; notifications: boolean }) {
  const { run, busy, notice } = useRun();
  const [name, setName] = useState(displayName);
  const [notify, setNotify] = useState(notifications);

  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(() => call("POST", "/update-profile", { display_name: name.trim(), notifications_enabled: notify }));
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Display name (2 to 40 characters)" htmlFor="pn">
        <input id="pn" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required minLength={2} maxLength={40} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        Notifications enabled
      </label>
      <button type="submit" disabled={busy} className={buttonClasses("primary", "md", "disabled:opacity-50")}>
        {busy ? "Saving..." : "Save changes"}
      </button>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
    </form>
  );
}

export function ReportForm() {
  const { run, busy, notice } = useRun();
  const [equipment, setEquipment] = useState("");
  const [location, setLocation] = useState("");
  const [severity, setSeverity] = useState("");
  const [description, setDescription] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { description: description.trim() };
    if (equipment.trim()) body.equipment_name = equipment.trim();
    if (location.trim()) body.location = location.trim();
    if (severity) body.severity = severity;
    await run(
      () => call("POST", "/report-issue", body),
      () => {
        setEquipment("");
        setLocation("");
        setSeverity("");
        setDescription("");
      }
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-3xl bg-white p-6 ring-1 ring-charcoal/5 sm:grid-cols-2">
      <Field label="Equipment (optional)" htmlFor="re">
        <input id="re" value={equipment} onChange={(e) => setEquipment(e.target.value)} className={inputClass} placeholder="Treadmill 4" />
      </Field>
      <Field label="Where in the gym (optional)" htmlFor="rl">
        <input id="rl" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="Cardio floor" />
      </Field>
      <Field label="How serious is it?" htmlFor="rs">
        <select id="rs" value={severity} onChange={(e) => setSeverity(e.target.value)} className={inputClass}>
          <option value="">Not sure</option>
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="What is wrong?" htmlFor="rd">
          <textarea id="rd" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={inputClass} required />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className={buttonClasses("primary", "md", "disabled:opacity-50")}>
          {busy ? "Sending..." : "Send report"}
        </button>
        {notice ? (
          <div className="mt-4">
            <Alert tone={notice.tone}>{notice.text}</Alert>
          </div>
        ) : null}
      </div>
    </form>
  );
}
