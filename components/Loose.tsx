import type { ReactElement } from "react";

export type Obj = Record<string, unknown>;

export function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

export function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Renders backend text of unknown inner shape (string, list or object) without inventing structure. */
export function Loose({ value }: { value: unknown }): ReactElement | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {value.map((v, i) => (
          <li key={i}>
            <Loose value={v} />
          </li>
        ))}
      </ul>
    );
  }
  if (isObj(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== null && v !== undefined && v !== "");
    if (entries.length === 0) return null;
    return (
      <dl className="space-y-2">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-charcoal/65">{k.replace(/_/g, " ")}</dt>
            <dd className="text-sm leading-relaxed">
              <Loose value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return null;
}
