"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClasses } from "@/components/ui";

export default function BookButton({
  classId,
  bookingId,
  isFull,
}: {
  classId: number;
  bookingId: number | null;
  isFull: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function act() {
    setError(null);
    setBusy(true);
    try {
      const res = bookingId
        ? await fetch(`/api/backend/bookings/${bookingId}`, { method: "DELETE" })
        : await fetch("/api/backend/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ class_id: classId }),
          });
      const json = await res.json().catch(() => null);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok || !json?.success) {
        setError(json?.message ?? "Something went wrong. Please try again.");
        return;
      }
      startRefresh(() => router.refresh());
    } catch {
      setError("Cannot reach the Fit Kats server.");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || refreshing || (!bookingId && isFull);
  const label = bookingId ? "Cancel booking" : isFull ? "Full" : "Book";

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={act}
        disabled={disabled}
        className={buttonClasses(bookingId ? "ghost" : "primary", "sm", "disabled:cursor-not-allowed disabled:opacity-50")}
      >
        {busy || refreshing ? "Working..." : label}
      </button>
      {error ? (
        <p role="alert" className="mt-2 max-w-[14rem] text-right text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}
