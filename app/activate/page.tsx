"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import AuthShell from "@/components/AuthShell";
import { Alert, ButtonLink, Field, buttonClasses, inputClass } from "@/components/ui";

export default function ActivatePage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [doneMessage, setDoneMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8 || password.length > 72) {
      setError("Password must be 8 to 72 characters");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? "Activation failed");
        setBusy(false);
        return;
      }
      setDoneMessage(data?.message ?? "Password set. You can now log in.");
      setBusy(false);
    } catch {
      setError("Cannot reach the Fit Kats server");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      headline={
        <>
          Make it
          <br />
          yours.
        </>
      }
      blurb="Use the one-time setup code from the front desk to choose your own password. Staff never see it."
    >
      {doneMessage ? (
        <div className="space-y-6">
          <h2 className="display text-4xl text-forest">You are set</h2>
          <Alert tone="success">{doneMessage}</Alert>
          <p className="text-sm leading-relaxed text-charcoal/70">
            If your sign-up is still awaiting verification, the front desk will finish that before
            you can check in.
          </p>
          <ButtonLink href="/login" className="w-full">
            Go to sign in
          </ButtonLink>
        </div>
      ) : (
        <>
          <h2 className="display text-4xl text-forest">Activate account</h2>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <Field label="Email" htmlFor="email">
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="The email you gave the front desk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Setup code" htmlFor="code" hint="Ten characters, shown as XXXXX-XXXXX. It works once.">
              <input
                id="code"
                type="text"
                required
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={14}
                placeholder="XXXXX-XXXXX"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className={`${inputClass} font-mono tracking-widest`}
              />
            </Field>
            <Field label="New password" htmlFor="password" hint="8 to 72 characters.">
              <input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Confirm password" htmlFor="confirm">
              <input
                id="confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
              />
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <button
              type="submit"
              disabled={busy}
              className={buttonClasses("primary", "md", "w-full disabled:opacity-60")}
            >
              {busy ? "Setting password..." : "Set my password"}
            </button>
          </form>
          <p className="mt-8 text-sm text-charcoal/70">
            Already set up?{" "}
            <Link href="/login" className="font-semibold text-forest underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
