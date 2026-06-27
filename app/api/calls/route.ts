import type { NextRequest } from "next/server";
import { ok, fail, handleApiError } from "@/lib/api";
import { listCalls, searchCalls } from "@/lib/data";
import { rateLimit } from "@/lib/rate-limit";
import { requireCurrentUser } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const limited = rateLimit(request);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const user = await requireCurrentUser();
    const search = request.nextUrl.searchParams.get("q")?.toLowerCase() || "";
    const calls = search ? await searchCalls(user.id, search) : await listCalls(user.id);
    return ok({ calls });
  } catch (error) {
    return handleApiError(error);
  }
}
