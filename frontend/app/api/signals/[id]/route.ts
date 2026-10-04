import { GET_SIGNAL } from "@/lib/proxy";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return GET_SIGNAL(id);
}
