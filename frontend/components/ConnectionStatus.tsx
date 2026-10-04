"use client";

import type { WsStatus } from "@/types";

export function ConnectionStatus({ status }: { status: WsStatus }) {
  const color =
    status === "CONNECTED" ? "bg-emerald-500" : status === "RECONNECTING" ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-wide font-semibold text-slate-700">
      <span className={`pulse-dot ${color}`} />
      {status}
    </div>
  );
}
