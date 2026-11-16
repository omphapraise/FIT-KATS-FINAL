import Link from "next/link";
import type { ReactNode } from "react";

export type Variant = "primary" | "amber" | "ghost" | "light";
export type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-wide transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber active:scale-[0.98]";

const variants: Record<Variant, string> = {
  primary: "bg-forest text-ivory hover:bg-forest-deep",
  amber: "bg-amber text-charcoal hover:brightness-105",
  ghost: "border border-charcoal/25 text-charcoal hover:border-charcoal hover:bg-charcoal/5",
  light: "border border-ivory/40 text-ivory hover:bg-ivory/10",
};

const sizes: Record<Size, string> = {
  md: "px-6 py-3 text-sm",
  sm: "px-4 py-2 text-sm",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Eyebrow({
  children,
  tone = "amber",
}: {
  children: ReactNode;
  tone?: "amber" | "forest";
}) {
  return (
    <p
      className={`mb-4 text-xs font-semibold uppercase tracking-[0.22em] ${
        tone === "amber" ? "text-amber" : "text-forest"
      }`}
    >
      {children}
    </p>
  );
}

export const inputClass =
  "w-full rounded-xl border border-charcoal/20 bg-white/70 px-4 py-3 text-charcoal placeholder:text-charcoal/40 outline-none transition focus:border-forest focus:ring-2 focus:ring-forest/25";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-charcoal">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-charcoal/60">{hint}</p>}
    </div>
  );
}

export function Alert({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  const styles =
    tone === "error"
      ? "border-red-700/30 bg-red-50 text-red-900"
      : "border-forest/30 bg-forest/10 text-forest-deep";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${styles}`}
    >
      {children}
    </div>
  );
}
