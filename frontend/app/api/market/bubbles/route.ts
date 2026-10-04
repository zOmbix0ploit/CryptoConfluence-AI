import { NextRequest } from "next/server";
import { GET_BUBBLES } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  return GET_BUBBLES(request);
}
