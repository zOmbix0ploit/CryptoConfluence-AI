"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { LOGO_DATA_URI } from "@/lib/logo";
import { formatPct, formatPrice } from "@/lib/utils";
import type { Benchmark, WsStatus } from "@/types";
import { LayoutDashboard, Radio, Newspaper, Sliders } from "lucide-react";

export function Header({
  btc,
  eth,
  connection,
  lastUpdate,
  freshness,
}: {
  btc: Benchmark | null;
  eth: Benchmark | null;
  connection: WsStatus;
  lastUpdate: string | null;
  freshness: "live" | "cached";
}) {
  const pathname = usePathname();

  const navLinks = [
    { href: "/", label: "Terminal", icon: LayoutDashboard },
    { href: "/signals", label: "Signals", icon: Radio },
    { href: "/news", label: "News Radar", icon: Newspaper },
    { href: "/settings", label: "Settings", icon: Sliders },
  ];

  return (
    <header className="terminal-panel relative overflow-hidden flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
      {/* Subtle top specular accent bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />

      {/* Brand & Nav Links */}
      <div className="flex items-center gap-6">
        <Link href="/" className="group flex items-center gap-3.5">
          <div className="relative flex items-center justify-center">
            <div className="w-11 h-11 rounded-full p-0.5 bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-800 shadow-lg shadow-slate-900/15 ring-2 ring-white transition-transform duration-200 group-hover:scale-105">
              <img
                src={LOGO_DATA_URI}
                alt="CryptoConfluence AI Logo"
                width={42}
                height={42}
                className="w-full h-full rounded-full object-cover"
              />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-mono tracking-[0.2em] text-indigo-600 font-bold">
                CryptoConfluence
              </span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-slate-900 text-white tracking-wider">
                AI
              </span>
            </div>
            <div className="text-base font-extrabold tracking-tight text-slate-900 leading-tight">
              Trading Terminal
            </div>
          </div>
        </Link>

        {/* Navigation Bar */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100/85 p-1 rounded-2xl border border-slate-200/80 shadow-inner">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-mono transition-all ${
                  isActive
                    ? "bg-slate-900 text-white font-semibold shadow-sm shadow-slate-900/20"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/80"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-indigo-300" : ""}`} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Benchmarks & Live Status */}
      <div className="flex flex-wrap items-center gap-3 md:gap-4 text-sm">
        <TickerChip label="BTC/USDT" data={btc} />
        <TickerChip label="ETH/USDT" data={eth} />

        <div className="border-l border-slate-200/90 pl-4 flex flex-col items-end">
          <ConnectionStatus status={connection} />
          <div className="mt-1 text-[10px] font-mono text-slate-500 flex items-center">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                freshness === "live" ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            {freshness === "live" ? "Live stream" : "Cached data"} ·{" "}
            {lastUpdate
              ? new Date(lastUpdate).toLocaleTimeString()
              : "Syncing..."}
          </div>
        </div>
      </div>
    </header>
  );
}

function TickerChip({ label, data }: { label: string; data: Benchmark | null }) {
  if (!data) {
    return (
      <div className="glass-subcard px-3.5 py-1.5 font-mono text-xs text-slate-400">
        <div className="text-[10px] uppercase text-slate-500 font-semibold">{label}</div>
        <div className="text-slate-400">Syncing…</div>
      </div>
    );
  }
  const up = data.change_24h >= 0;
  return (
    <div className="glass-subcard px-3.5 py-1.5 flex items-center gap-3">
      <div>
        <div className="text-[10px] font-mono uppercase text-slate-500 font-semibold tracking-wider">
          {label}
        </div>
        <div className="font-mono text-sm font-extrabold text-slate-900">
          ${formatPrice(data.price)}
        </div>
      </div>
      <span
        className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg border ${
          up
            ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
            : "bg-rose-50 text-rose-700 border-rose-200/80"
        }`}
      >
        {formatPct(data.change_24h)}
      </span>
    </div>
  );
}
