"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { CoinIcon } from "@/components/CoinIcon";
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
  const pathname = usePathname() || "/";
  const normalizedPath =
    pathname.replace(/^\/CryptoConfluence-AI/, "") || "/";

  const navLinks = [
    { href: "/", label: "Terminal", icon: LayoutDashboard },
    { href: "/signals", label: "Signals", icon: Radio },
    { href: "/news", label: "News Radar", icon: Newspaper },
    { href: "/settings", label: "Settings", icon: Sliders },
  ];

  return (
    <>
      <header className="terminal-panel relative overflow-hidden flex flex-col gap-3 px-3.5 py-3 sm:px-5 sm:py-3.5">
        {/* Subtle top specular accent bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />

        {/* Top Row: Brand, Desktop Nav, and Live Status */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Desktop Nav Links */}
          <div className="flex items-center gap-4 lg:gap-6 min-w-0">
            <Link href="/" className="group flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <div className="relative flex items-center justify-center shrink-0">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full p-0.5 bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-800 shadow-lg shadow-slate-900/15 ring-2 ring-white transition-transform duration-200 group-hover:scale-105">
                  <img
                    src={LOGO_DATA_URI}
                    alt="CryptoConfluence AI Logo"
                    width={42}
                    height={42}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] sm:text-[10px] uppercase font-mono tracking-[0.16em] sm:tracking-[0.2em] text-indigo-600 font-bold truncate">
                    CryptoConfluence
                  </span>
                  <span className="text-[8px] sm:text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-slate-900 text-white tracking-wider shrink-0">
                    AI
                  </span>
                </div>
                <div className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 leading-tight truncate">
                  Trading Terminal
                </div>
              </div>
            </Link>

            {/* Desktop Navigation Bar */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-100/85 p-1 rounded-2xl border border-slate-200/80 shadow-inner">
              {navLinks.map(({ href, label, icon: Icon }) => {
                const isActive =
                  href === "/"
                    ? normalizedPath === "/"
                    : normalizedPath.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-1.5 px-3.5 lg:px-4 py-1.5 rounded-xl text-xs font-mono transition-all ${
                      isActive
                        ? "bg-slate-900 text-white font-semibold shadow-sm shadow-slate-900/20"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/80"
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 ${
                        isActive ? "text-indigo-300" : ""
                      }`}
                    />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Side: Desktop Benchmarks & Live Status */}
          <div className="flex items-center gap-2.5 sm:gap-4 text-sm ml-auto">
            <div className="hidden xl:flex items-center gap-3">
              <TickerChip label="BTC/USDT" data={btc} />
              <TickerChip label="ETH/USDT" data={eth} />
            </div>

            <div className="xl:border-l xl:border-slate-200/90 xl:pl-4 flex flex-col items-end">
              <ConnectionStatus status={connection} />
              <div className="mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] font-mono text-slate-500 flex items-center">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                    freshness === "live" ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                <span className="hidden xs:inline">
                  {freshness === "live" ? "Live" : "Cached"} ·{" "}
                </span>
                {lastUpdate
                  ? new Date(lastUpdate).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Syncing..."}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile & Tablet Benchmarks Row (< 1280px) */}
        <div className="grid grid-cols-2 gap-2 xl:hidden">
          <TickerChip label="BTC/USDT" data={btc} compact />
          <TickerChip label="ETH/USDT" data={eth} compact />
        </div>

        {/* Mobile In-Header Navigation Pills (< 768px) */}
        <nav className="grid grid-cols-4 md:hidden gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/"
                ? normalizedPath === "/"
                : normalizedPath.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg text-[11px] font-mono transition-all ${
                  isActive
                    ? "bg-slate-900 text-white font-bold shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon
                  className={`w-3 h-3 shrink-0 ${
                    isActive ? "text-indigo-300" : ""
                  }`}
                />
                <span className="truncate">{label.replace(" Radar", "")}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Fixed Bottom Mobile App Dock (< 768px) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 px-2 py-1.5 shadow-[0_-8px_24px_-6px_rgba(15,23,42,0.12)]">
        <div className="grid grid-cols-4 gap-1 max-w-md mx-auto">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/"
                ? normalizedPath === "/"
                : normalizedPath.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl font-mono text-[10px] transition-all ${
                  isActive
                    ? "bg-slate-900 text-white font-bold shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? "text-indigo-300" : "text-slate-500"
                  }`}
                />
                <span className="truncate">{label.replace(" Radar", "")}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function TickerChip({
  label,
  data,
  compact = false,
}: {
  label: string;
  data: Benchmark | null;
  compact?: boolean;
}) {
  if (!data) {
    return (
      <div className="glass-subcard px-3 py-1.5 font-mono text-xs text-slate-400 flex items-center justify-between">
        <span className="text-[10px] uppercase text-slate-500 font-semibold">
          {label}
        </span>
        <span className="text-slate-400 text-[11px]">Syncing…</span>
      </div>
    );
  }
  const up = data.change_24h >= 0;
  return (
    <div
      className={`glass-subcard ${
        compact ? "px-2.5 py-1.5 justify-between" : "px-3.5 py-1.5 gap-3"
      } flex items-center`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <CoinIcon
          symbol={label}
          size={compact ? 18 : 22}
          className="ring-1 ring-slate-200/80"
        />
        <div className="min-w-0">
          <div className="text-[9px] sm:text-[10px] font-mono uppercase text-slate-500 font-semibold tracking-wider">
            {label}
          </div>
          <div className="font-mono text-xs sm:text-sm font-extrabold text-slate-900 truncate">
            ${formatPrice(data.price)}
          </div>
        </div>
      </div>
      <span
        className={`font-mono text-[10px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 rounded-lg border shrink-0 ${
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
