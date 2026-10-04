import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend";

export async function GET(_request: NextRequest, context: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await context.params;
  try {
    const data = await backendFetch(`/news?symbol=${encodeURIComponent(symbol)}`);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backend unavailable";
    return NextResponse.json({ detail: message }, { status: 503 });
  }
}
