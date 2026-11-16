"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toCanvas } from "qrcode";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/member";

const REFRESH_MS = 45_000; // backend token lives 60 seconds

export default function QrCheckin() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/backend/checkin-token", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const token = json?.data?.token;
      if (!res.ok || !json?.success || typeof token !== "string") {
        setMessage(json?.message ?? "Could not get a check-in code.");
        setState("error");
        return;
      }
      if (canvasRef.current) {
        await toCanvas(canvasRef.current, token, {
          width: 208,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#173D30", light: "#FFFFFF" },
        });
      }
      setState("ready");
    } catch {
      setMessage("Cannot reach the Fit Kats server.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h2 className="display text-2xl text-forest">Check-in code</h2>
        <button
          type="button"
          onClick={load}
          aria-label="Refresh check-in code"
          className="rounded-full p-2 text-forest transition-colors hover:bg-forest/10"
        >
          <RefreshCw size={16} aria-hidden />
        </button>
      </div>
      <div className="mt-5 flex min-h-[13rem] items-center justify-center rounded-2xl bg-white p-3 ring-1 ring-charcoal/10">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Check-in QR code"
          className={state === "ready" ? "block" : "hidden"}
        />
        {state === "loading" ? <Skeleton className="h-48 w-48" /> : null}
        {state === "error" ? <p role="alert" className="px-3 text-center text-sm text-charcoal/70">{message}</p> : null}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-charcoal/70">
        Show this at the front desk. It refreshes every 45 seconds and only works for a minute.
      </p>
    </div>
  );
}
