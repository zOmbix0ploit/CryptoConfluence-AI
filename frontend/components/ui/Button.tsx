import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs",
    ghost: "bg-white/70 hover:bg-white text-slate-700 border border-slate-200/80 shadow-2xs",
    danger: "bg-rose-600 hover:bg-rose-500 text-white shadow-xs",
  }[variant];
  return (
    <button
      className={cn("rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50", styles, className)}
      {...props}
    />
  );
}
