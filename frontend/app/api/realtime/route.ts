import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const backend = process.env.FASTAPI_BASE_URL || "http://localhost:8000";
  const target = backend.replace(/^http/, "ws") + "/ws";
  return NextResponse.json({
    ws: target,
    note: "Browser should connect through this documented backend WS; Next.js does not open Binance sockets.",
    request_origin: request.nextUrl.origin,
  });
}
