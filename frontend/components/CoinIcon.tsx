"use client";

import { useState, useMemo } from "react";
import cmcIcons from "@/lib/cmc_icons.json";

const ICON_MAP: Record<string, string> = cmcIcons as Record<string, string>;

const ALIAS_MAP: Record<string, string> = {
  BEAMX: "BEAM",
  RONIN: "RON",
  LUNA2: "LUNA",
  BTTC: "BTT",
};

const GRADIENT_PALETTES = [
  ["#f59e0b", "#d97706"],
  ["#6366f1", "#4f46e5"],
  ["#10b981", "#059669"],
  ["#ec4899", "#db2777"],
  ["#3b82f6", "#2563eb"],
  ["#8b5cf6", "#7c3aed"],
  ["#14b8a6", "#0d9488"],
  ["#f97316", "#ea580c"],
];

export function cleanCoinTicker(rawSymbol: string): string {
  if (!rawSymbol) return "BTC";
  let sym = rawSymbol
    .toUpperCase()
    .trim()
    .replace("/USDT", "")
    .replace("-USDT", "")
    .replace("_USDT", "");
  if (sym.endsWith("USDT") && sym.length > 4) {
    sym = sym.slice(0, -4);
  }
  return ALIAS_MAP[sym] || sym;
}

export function getCandidateIconUrls(rawSymbol: string): string[] {
  const ticker = cleanCoinTicker(rawSymbol);
  const stripped = ticker.replace(/^1000000|^1000/, "");
  const urls: string[] = [];

  if (ICON_MAP[ticker]) urls.push(ICON_MAP[ticker]);
  if (stripped && stripped !== ticker && ICON_MAP[stripped]) {
    urls.push(ICON_MAP[stripped]);
  }

  const lower = (stripped || ticker).toLowerCase();
  if (/^[a-z0-9]+$/.test(lower)) {
    urls.push(`https://assets.coincap.io/assets/icons/${lower}@2x.png`);
    urls.push(
      `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${lower}.png`
    );
  }

  return urls;
}

interface CoinIconProps {
  symbol: string;
  size?: number;
  className?: string;
}

export function CoinIcon({
  symbol,
  size = 20,
  className = "",
}: CoinIconProps) {
  const ticker = useMemo(() => cleanCoinTicker(symbol), [symbol]);
  const candidates = useMemo(() => getCandidateIconUrls(symbol), [symbol]);
  const [idx, setIdx] = useState(0);

  // Deterministic color fallback if all CDN URLs fail
  const [c1, c2] = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < ticker.length; i++) {
      hash = (hash * 31 + ticker.charCodeAt(i)) >>> 0;
    }
    return GRADIENT_PALETTES[hash % GRADIENT_PALETTES.length];
  }, [ticker]);

  const currentUrl = candidates[idx];

  if (!currentUrl) {
    return (
      <span
        style={{
          width: `${size}px`,
          height: `${size}px`,
          background: `linear-gradient(135deg, ${c1}, ${c2})`,
          fontSize: `${Math.max(8, Math.round(size * 0.42))}px`,
        }}
        className={`inline-flex items-center justify-center rounded-full text-white font-mono font-extrabold shadow-2xs shrink-0 select-none ${className}`}
        title={ticker}
      >
        {ticker.slice(0, 3)}
      </span>
    );
  }

  return (
    <img
      src={currentUrl}
      alt={ticker}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setIdx((prev) => prev + 1)}
      style={{ width: `${size}px`, height: `${size}px` }}
      className={`rounded-full object-contain shrink-0 select-none bg-white/90 shadow-2xs ${className}`}
    />
  );
}
