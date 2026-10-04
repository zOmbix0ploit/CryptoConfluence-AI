import { NextRequest } from "next/server";
import { GET_NEWS } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  return GET_NEWS(request);
}
