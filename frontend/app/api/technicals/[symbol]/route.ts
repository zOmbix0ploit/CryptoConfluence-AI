import { NextRequest } from "next/server";
import { GET_TECHNICALS } from "@/lib/proxy";

export async function GET(request: NextRequest, context: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await context.params;
  return GET_TECHNICALS(symbol, request);
}
