import { GET_HEALTH } from "@/lib/proxy";

export async function GET() {
  return GET_HEALTH();
}
