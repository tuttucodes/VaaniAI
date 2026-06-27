import type { NextRequest } from "next/server";
import { ok, fail, handleApiError } from "@/lib/api";
import { endCall } from "@/lib/calls/service";
import { rateLimit } from "@/lib/rate-limit";
import { requireCurrentUser } from "@/lib/supabase/server";
import { endCallSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, 30);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const user = await requireCurrentUser();
    const input = endCallSchema.parse(await request.json());
    const result = await endCall(user.id, input.call_id);
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
