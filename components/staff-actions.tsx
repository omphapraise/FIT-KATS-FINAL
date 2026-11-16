"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Pill } from "@/components/staff";
import { Alert, buttonClasses, Field, inputClass } from "@/components/ui";
import { call, pick, useRun } from "@/lib/client";
import { asList, formatStamp, type StaffClass } from "@/lib/staffData";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function NoteForm({ memberId }: { memberId: number }) {
  const { run, busy, notice } = useRun();
  const [note, setNote] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await run(() => call("POST", `/staff/members/${memberId}/notes`, { note: note.trim() }), () => setNote(""));
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="note" className="sr-only">
        Add a note
      </label>
      <textarea
        id="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={1000}
        className={inputClass}
        placeholder="Add a note for the team"
      />
      <button type="submit" disabled={busy || !note.trim()} className={buttonClasses("ghost", "sm", "disabled:opacity-50")}>
        Save note
      </button>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
    </form>
  );
}

export function ClassForm() {
  const { run, busy, notice, setNotice } = useRun();
  const [title, setTitle] = useState("");
  const [coach, setCoach] = useState("");
  const [description, setDescription] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [capacity, setCapacity] = useState("15");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const s = new Date(starts);
    const en = new Date(ends);
    if (Number.isNaN(s.getTime()) || Number.isNaN(en.getTime())) {
      setNotice({ tone: "error", text: "Choose a start and end time." });
      return;
    }
    await run(
      () =>
        call("POST", "/staff/classes", {
          title: title.trim(),
          coach: coach.trim(),
          description: description.trim(),
          starts_at: s.toISOString(),
          ends_at: en.toISOString(),
          capacity: Number(capacity),
        }),
      () => {
        setTitle("");
        setCoach("");
        setDescription("");
        setStarts("");
        setEnds("");
      }
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-3xl bg-white p-6 ring-1 ring-charcoal/5 sm:grid-cols-2">
      <Field label="Title (2 to 80 characters)" htmlFor="ct">
        <input id="ct" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required minLength={2} maxLength={80} />
      </Field>
      <Field label="Coach (2 to 60 characters)" htmlFor="cc">
        <input id="cc" value={coach} onChange={(e) => setCoach(e.target.value)} className={inputClass} required minLength={2} maxLength={60} />
      </Field>
      <Field label="Starts" htmlFor="cs">
        <input id="cs" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} className={inputClass} required />
      </Field>
      <Field label="Ends" htmlFor="ce">
        <input id="ce" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} className={inputClass} required />
      </Field>
      <Field label="Capacity (1 to 500)" htmlFor="cp">
        <input id="cp" type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputClass} required />
      </Field>
      <Field label="Description (up to 500 characters)" htmlFor="cd">
        <input id="cd" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} required maxLength={500} />
      </Field>
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className={buttonClasses("primary", "md", "disabled:opacity-50")}>
          {busy ? "Adding..." : "Add class"}
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

export function CancelClassButton({ id }: { id: number }) {
  const { run, busy, notice } = useRun();
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (window.confirm("Cancel this class? Existing bookings are left as they are.")) {
            run(() => call("POST", `/staff/classes/${id}/cancel`));
          }
        }}
        className={buttonClasses("ghost", "sm", "disabled:opacity-50")}
      >
        {busy ? "Working..." : "Cancel class"}
      </button>
      {notice && notice.tone === "error" ? <p role="alert" className="mt-2 text-sm text-red-800">{notice.text}</p> : null}
    </div>
  );
}

type RosterRow = { booking_id: number; user_id: number; display_name: string; membership_tier?: string; created_at?: string };

function Roster({ id }: { id: number }) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; rows: RosterRow[] }>({
    loading: true,
    error: null,
    rows: [],
  });

  useEffect(() => {
    let live = true;
    call("GET", `/staff/classes/${id}/bookings`).then((r) => {
      if (!live) return;
      if (!r.ok) {
        setState({ loading: false, error: r.message, rows: [] });
        return;
      }
      setState({ loading: false, error: null, rows: asList<RosterRow>(pick(r, "bookings")) });
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (state.loading) return <p className="text-sm text-charcoal/70">Loading roster...</p>;
  if (state.error) return <Alert tone="error">{state.error}</Alert>;
  if (state.rows.length === 0) return <p className="text-sm text-charcoal/70">No confirmed bookings yet.</p>;
  return (
    <ul className="divide-y divide-charcoal/10 rounded-2xl bg-ivory px-4">
      {state.rows.map((b) => (
        <li key={b.booking_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          <Link href={`/staff/members/${b.user_id}`} className="font-semibold text-forest underline-offset-2 hover:underline">
            {b.display_name}
          </Link>
          <span className="text-charcoal/70">
            {b.membership_tier ?? ""}
            {b.created_at ? ` · booked ${formatStamp(b.created_at)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ClassEditor({ cls, onDone }: { cls: StaffClass; onDone: () => void }) {
  const { run, busy, notice, setNotice } = useRun();
  const startInit = toLocalInput(cls.starts_at);
  const endInit = toLocalInput(cls.ends_at);
  const [title, setTitle] = useState(cls.title);
  const [coach, setCoach] = useState(cls.coach ?? "");
  const [description, setDescription] = useState(cls.description ?? "");
  const [starts, setStarts] = useState(startInit);
  const [ends, setEnds] = useState(endInit);
  const [capacity, setCapacity] = useState(String(cls.capacity));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    if (title.trim() !== cls.title) body.title = title.trim();
    if (coach.trim() !== (cls.coach ?? "")) body.coach = coach.trim();
    if (description.trim() !== (cls.description ?? "")) body.description = description.trim();
    if (starts !== startInit) {
      const s = new Date(starts);
      if (Number.isNaN(s.getTime())) return setNotice({ tone: "error", text: "Choose a valid start time." });
      body.starts_at = s.toISOString();
    }
    if (ends !== endInit) {
      const en = new Date(ends);
      if (Number.isNaN(en.getTime())) return setNotice({ tone: "error", text: "Choose a valid end time." });
      body.ends_at = en.toISOString();
    }
    if (Number(capacity) !== cls.capacity) body.capacity = Number(capacity);
    if (Object.keys(body).length === 0) return setNotice({ tone: "error", text: "Nothing to change." });
    await run(() => call("PUT", `/staff/classes/${cls.id}`, body), onDone);
  }

  const k = `e${cls.id}`;
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl bg-ivory p-5 sm:grid-cols-2">
      <Field label="Title" htmlFor={`${k}t`}>
        <input id={`${k}t`} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required minLength={2} maxLength={80} />
      </Field>
      <Field label="Coach" htmlFor={`${k}c`}>
        <input id={`${k}c`} value={coach} onChange={(e) => setCoach(e.target.value)} className={inputClass} required minLength={2} maxLength={60} />
      </Field>
      <Field label="Starts" htmlFor={`${k}s`}>
        <input id={`${k}s`} type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} className={inputClass} required />
      </Field>
      <Field label="Ends" htmlFor={`${k}e`}>
        <input id={`${k}e`} type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} className={inputClass} required />
      </Field>
      <Field label="Capacity" htmlFor={`${k}p`} hint="Cannot go below the confirmed bookings.">
        <input id={`${k}p`} type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputClass} required />
      </Field>
      <Field label="Description" htmlFor={`${k}d`}>
        <input id={`${k}d`} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} required maxLength={500} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className={buttonClasses("primary", "sm", "disabled:opacity-50")}>
          {busy ? "Saving..." : "Save changes"}
        </button>
        <button type="button" onClick={onDone} className={buttonClasses("ghost", "sm")}>
          Close
        </button>
      </div>
      {notice ? (
        <div className="sm:col-span-2">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}
    </form>
  );
}

export function ClassTools({ cls, editable }: { cls: StaffClass; editable: boolean }) {
  const [panel, setPanel] = useState<null | "roster" | "edit">(null);
  const toggle = (p: "roster" | "edit") => setPanel(panel === p ? null : p);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => toggle("roster")} className={buttonClasses("ghost", "sm")}>
          {panel === "roster" ? "Hide roster" : "Roster"}
        </button>
        {editable ? (
          <>
            <button type="button" onClick={() => toggle("edit")} className={buttonClasses("ghost", "sm")}>
              {panel === "edit" ? "Close editor" : "Edit"}
            </button>
            <CancelClassButton id={cls.id} />
          </>
        ) : null}
      </div>
      {panel === "roster" ? (
        <div className="w-full basis-full">
          <Roster id={cls.id} />
        </div>
      ) : null}
      {panel === "edit" && editable ? (
        <div className="w-full basis-full">
          <ClassEditor cls={cls} onDone={() => setPanel(null)} />
        </div>
      ) : null}
    </>
  );
}

export function AnnouncementForm() {
  const { run, busy, notice } = useRun();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(
      () => call("POST", "/staff/announcements", { title: title.trim(), body: body.trim(), is_pinned: pinned }),
      () => {
        setTitle("");
        setBody("");
        setPinned(false);
      }
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-charcoal/5">
      <Field label="Title (2 to 80 characters)" htmlFor="at">
        <input id="at" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required minLength={2} maxLength={80} />
      </Field>
      <Field label="Message (up to 1000 characters)" htmlFor="ab">
        <textarea id="ab" value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={inputClass} required maxLength={1000} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        Pin to the top for members
      </label>
      <button type="submit" disabled={busy} className={buttonClasses("primary", "md", "disabled:opacity-50")}>
        {busy ? "Publishing..." : "Publish"}
      </button>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
    </form>
  );
}

export function ArchiveAnnouncementButton({ id }: { id: number }) {
  const { run, busy, notice } = useRun();
  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (window.confirm("Archive this announcement? It disappears for members and cannot be restored.")) {
            run(() => call("POST", `/staff/announcements/${id}/archive`));
          }
        }}
        className={buttonClasses("ghost", "sm", "disabled:opacity-50")}
      >
        {busy ? "Working..." : "Archive"}
      </button>
      {notice && notice.tone === "error" ? <p role="alert" className="mt-2 text-sm text-red-800">{notice.text}</p> : null}
    </div>
  );
}

function AnnouncementEditor({
  id,
  title: t0,
  body: b0,
  pinned: p0,
  onDone,
}: {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  onDone: () => void;
}) {
  const { run, busy, notice, setNotice } = useRun();
  const [title, setTitle] = useState(t0);
  const [body, setBody] = useState(b0);
  const [pinned, setPinned] = useState(p0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {};
    if (title.trim() !== t0) payload.title = title.trim();
    if (body.trim() !== b0) payload.body = body.trim();
    if (pinned !== p0) payload.is_pinned = pinned;
    if (Object.keys(payload).length === 0) return setNotice({ tone: "error", text: "Nothing to change." });
    await run(() => call("PUT", `/staff/announcements/${id}`, payload), onDone);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-ivory p-5">
      <Field label="Title (2 to 80 characters)" htmlFor={`an${id}t`}>
        <input id={`an${id}t`} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required minLength={2} maxLength={80} />
      </Field>
      <Field label="Message (up to 1000 characters)" htmlFor={`an${id}b`}>
        <textarea id={`an${id}b`} value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={inputClass} required maxLength={1000} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        Pinned
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={buttonClasses("primary", "sm", "disabled:opacity-50")}>
          {busy ? "Saving..." : "Save changes"}
        </button>
        <button type="button" onClick={onDone} className={buttonClasses("ghost", "sm")}>
          Close
        </button>
      </div>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
    </form>
  );
}

export function AnnouncementTools({ id, title, body, pinned }: { id: number; title: string; body: string; pinned: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setEditing(!editing)} className={buttonClasses("ghost", "sm")}>
          {editing ? "Close editor" : "Edit"}
        </button>
        <ArchiveAnnouncementButton id={id} />
      </div>
      {editing ? (
        <div className="w-full basis-full">
          <AnnouncementEditor id={id} title={title} body={body} pinned={pinned} onDone={() => setEditing(false)} />
        </div>
      ) : null}
    </>
  );
}

type EventRow = {
  id: number;
  actor_name?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  note?: string | null;
  created_at?: string;
};

function HistoryList({ id }: { id: number }) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; rows: EventRow[] }>({
    loading: true,
    error: null,
    rows: [],
  });

  useEffect(() => {
    let live = true;
    call("GET", `/staff/reports/${id}`).then((r) => {
      if (!live) return;
      if (!r.ok) {
        setState({ loading: false, error: r.message, rows: [] });
        return;
      }
      setState({ loading: false, error: null, rows: asList<EventRow>(pick(r, "events")) });
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (state.loading) return <p className="mt-3 text-sm text-charcoal/70">Loading history...</p>;
  if (state.error) return <div className="mt-3"><Alert tone="error">{state.error}</Alert></div>;
  if (state.rows.length === 0) return <p className="mt-3 text-sm text-charcoal/70">No history recorded yet.</p>;
  return (
    <ol className="mt-3 space-y-3 border-l-2 border-forest/20 pl-4">
      {state.rows.map((ev) => (
        <li key={ev.id} className="text-sm">
          <p className="flex flex-wrap items-center gap-2">
            {ev.to_status && ev.to_status !== ev.from_status ? (
              <Pill tone={ev.to_status === "Resolved" ? "ok" : ev.to_status === "In Progress" ? "warn" : "muted"}>
                {ev.from_status ? `${ev.from_status} to ${ev.to_status}` : ev.to_status}
              </Pill>
            ) : null}
            <span className="text-charcoal/70">
              {ev.actor_name ?? "System"} · {formatStamp(ev.created_at)}
            </span>
          </p>
          {ev.note ? <p className="mt-1 leading-relaxed">{ev.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function ReportHistory({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 border-t border-charcoal/10 pt-4">
      <button type="button" onClick={() => setOpen(!open)} className={buttonClasses("ghost", "sm")}>
        {open ? "Hide history" : "Show history"}
      </button>
      {open ? <HistoryList id={id} /> : null}
    </div>
  );
}

export function ReportEditor({
  id,
  status,
  severity,
  resolutionNote,
  meId,
  assignedToMe,
}: {
  id: number;
  status: string;
  severity: string | null;
  resolutionNote: string | null;
  meId: number;
  assignedToMe: boolean;
}) {
  const { run, busy, notice, setNotice } = useRun();
  const [st, setSt] = useState(status);
  const [sev, setSev] = useState(severity ?? "");
  const [res, setRes] = useState(resolutionNote ?? "");
  const [note, setNote] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    if (st !== status) body.status = st;
    if (sev !== (severity ?? "")) body.severity = sev || null;
    if (res !== (resolutionNote ?? "")) body.resolution_note = res;
    if (note.trim()) body.note = note.trim();
    if (Object.keys(body).length === 0) {
      setNotice({ tone: "error", text: "Nothing to change." });
      return;
    }
    await run(() => call("PATCH", `/staff/reports/${id}`, body), () => setNote(""));
  }

  return (
    <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
      <Field label="Status" htmlFor={`st${id}`}>
        <select id={`st${id}`} value={st} onChange={(e) => setSt(e.target.value)} className={inputClass}>
          <option>Open</option>
          <option>In Progress</option>
          <option>Resolved</option>
        </select>
      </Field>
      <Field label="Severity" htmlFor={`sv${id}`}>
        <select id={`sv${id}`} value={sev} onChange={(e) => setSev(e.target.value)} className={inputClass}>
          <option value="">Not set</option>
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Resolution note" htmlFor={`rs${id}`} hint="Required to mark a report Resolved.">
          <textarea id={`rs${id}`} value={res} onChange={(e) => setRes(e.target.value)} rows={2} className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Add a note to the history" htmlFor={`nt${id}`}>
          <input id={`nt${id}`} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} maxLength={300} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className={buttonClasses("primary", "sm", "disabled:opacity-50")}>
          {busy ? "Saving..." : "Save changes"}
        </button>
        {!assignedToMe ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => call("PATCH", `/staff/reports/${id}`, { assigned_to: meId }))}
            className={buttonClasses("ghost", "sm", "disabled:opacity-50")}
          >
            Assign to me
          </button>
        ) : null}
      </div>
      {notice ? (
        <div className="sm:col-span-2">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}
    </form>
  );
}
