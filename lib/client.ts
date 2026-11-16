"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type CallResult = {
  ok: boolean;
  status: number;
  message: string;
  json: Record<string, unknown> | null;
};

/** Browser call to the backend through the cookie proxy. path starts with "/", e.g. "/staff/members". */
export async function call(method: string, path: string, body?: unknown): Promise<CallResult> {
  try {
    const res = await fetch(`/api/backend${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.status === 401) window.location.href = "/login";
    const message =
      typeof json?.message === "string" ? json.message : res.ok ? "Done." : "Something went wrong. Please try again.";
    return { ok: res.ok && json?.success === true, status: res.status, message, json };
  } catch {
    return { ok: false, status: 0, message: "Cannot reach the Fit Kats server.", json: null };
  }
}

/** Read a field from the response, from data first and then from the top level. */
export function pick(r: CallResult, key: string): unknown {
  const d = r.json?.data;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const v = (d as Record<string, unknown>)[key];
    if (v !== undefined) return v;
  }
  return r.json?.[key];
}

export type Notice = { tone: "error" | "success"; text: string } | null;

export function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startRefresh] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);

  async function run(fn: () => Promise<CallResult>, onOk?: (r: CallResult) => void) {
    setBusy(true);
    setNotice(null);
    const r = await fn();
    setBusy(false);
    setNotice({ tone: r.ok ? "success" : "error", text: r.message });
    if (r.ok) {
      onOk?.(r);
      startRefresh(() => router.refresh());
    }
    return r;
  }

  return { run, busy: busy || pending, notice, setNotice };
}
