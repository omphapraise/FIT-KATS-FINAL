"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { shortDay } from "@/lib/managerData";

type TipEntry = { value?: unknown; name?: unknown };

function ChartTip({
  active,
  payload,
  label,
  prefix,
  title,
  dateLabel,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TipEntry>;
  label?: unknown;
  prefix?: string;
  title?: string;
  dateLabel?: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const heading = dateLabel && typeof label === "string" ? shortDay(label) : String(label ?? "");
  return (
    <div className="rounded-xl bg-charcoal px-3 py-2 text-xs text-ivory shadow-lg">
      <p className="font-semibold">{heading}</p>
      {payload.map((p, i) => (
        <p key={i} className="mt-0.5 tabular-nums">
          {title ?? String(p.name ?? "")}: {prefix ?? ""}
          {String(p.value ?? "")}
        </p>
      ))}
    </div>
  );
}

const AXIS = { fontSize: 12, fill: "#5b5f58" };

/** One bar per day. Values come from the backend; days with no records are real zeros. */
export function DayBars({
  data,
  title,
  prefix,
  color = "#173D30",
}: {
  data: { date: string; value: number }[];
  title: string;
  prefix?: string;
  color?: string;
}) {
  return (
    <div role="img" aria-label={`${title} per day`} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(36,39,34,0.08)" />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => shortDay(v)}
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
          <Tooltip
            cursor={{ fill: "rgba(23,61,48,0.06)" }}
            content={<ChartTip title={title} prefix={prefix} dateLabel />}
          />
          <Bar dataKey="value" name={title} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type TierDatum = {
  tier: string;
  active: number;
  expired: number;
  pending: number;
  rejected: number;
  deactivated: number;
};

/** Members per tier, stacked by derived status. */
export function TierStack({ data }: { data: TierDatum[] }) {
  return (
    <div role="img" aria-label="Members by tier and status" className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(36,39,34,0.08)" />
          <XAxis dataKey="tier" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
          <Tooltip cursor={{ fill: "rgba(23,61,48,0.06)" }} content={<ChartTip />} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="active" name="Active" stackId="s" fill="#173D30" />
          <Bar dataKey="expired" name="Expired" stackId="s" fill="#C58A35" />
          <Bar dataKey="pending" name="Pending" stackId="s" fill="#A6A18F" />
          <Bar dataKey="rejected" name="Rejected" stackId="s" fill="#79543D" />
          <Bar dataKey="deactivated" name="Deactivated" stackId="s" fill="#242722" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
