import { NextRequest } from "next/server";
import { GET_SETTINGS, POST_SETTINGS } from "@/lib/proxy";

export async function GET() {
  return GET_SETTINGS();
}

export async function POST(request: NextRequest) {
  return POST_SETTINGS(request);
}
