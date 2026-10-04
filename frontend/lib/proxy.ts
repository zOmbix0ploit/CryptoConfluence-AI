import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend";

async function proxy(path: string) {
  try {
    const data = await backendFetch(path);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backend unavailable";
    return NextResponse.json({ detail: message }, { status: 503 });
  }
}

export async function GET_OVERVIEW() {
  return proxy("/market/overview");
}

export async function GET_BUBBLES(request: NextRequest) {
  const tf = request.nextUrl.searchParams.get("timeframe") ?? "24h";
  return proxy(`/market/bubbles?timeframe=${encodeURIComponent(tf)}`);
}

export async function GET_CANDLES(request: NextRequest, symbol: string) {
  const interval = request.nextUrl.searchParams.get("interval") ?? "15m";
  return proxy(
    `/market/candles?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,
  );
}

export async function GET_NEWS(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const qs = symbol ? `?symbol=${encodeURIComponent(symbol)}` : "";
  return proxy(`/news${qs}`);
}

export async function GET_TECHNICALS(symbol: string, request: NextRequest) {
  const tf = request.nextUrl.searchParams.get("timeframe") ?? "15m";
  return proxy(`/technicals?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(tf)}`);
}

export async function GET_SIGNALS() {
  return proxy("/signals");
}

export async function GET_SIGNAL(id: string) {
  return proxy(`/signals/${encodeURIComponent(id)}`);
}

export async function GET_HEALTH() {
  return proxy("/health");
}

async function proxyPost(path: string, body?: unknown) {
  try {
    const data = await backendFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backend unavailable";
    return NextResponse.json({ detail: message }, { status: 400 });
  }
}

export async function GET_SETTINGS() {
  return proxy("/settings");
}

export async function POST_SETTINGS(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyPost("/settings", body);
}

export async function POST_TEST_NOTIFICATION(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyPost("/settings/test-notification", body);
}

export async function POST_SCAN_SIGNALS() {
  return proxyPost("/signals/scan", {});
}

export async function POST_DISCORD_PNL_REPORT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyPost("/signals/discord-pnl-report", body);
}
