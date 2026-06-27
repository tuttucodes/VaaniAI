import type { NextRequest } from "next/server";
import { ok, fail, handleApiError } from "@/lib/api";
import { listAgents } from "@/lib/data";
import { rateLimit } from "@/lib/rate-limit";
import { requireCurrentUser } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const limited = rateLimit(request);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const user = await requireCurrentUser();
    const agents = await listAgents(user.id);
    return ok({ agents });
  } catch (error) {
    return handleApiError(error);
  }
}
