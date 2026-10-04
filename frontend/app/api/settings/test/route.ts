import { NextRequest } from "next/server";
import { POST_TEST_NOTIFICATION } from "@/lib/proxy";

export async function POST(request: NextRequest) {
  return POST_TEST_NOTIFICATION(request);
}
