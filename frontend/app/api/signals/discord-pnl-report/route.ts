import { NextRequest } from "next/server";
import { POST_DISCORD_PNL_REPORT } from "@/lib/proxy";

export async function POST(request: NextRequest) {
  return POST_DISCORD_PNL_REPORT(request);
}
