import type { NextRequest } from "next/server";
import { ok, fail, handleApiError } from "@/lib/api";
import { startCall } from "@/lib/calls/service";
import { rateLimit } from "@/lib/rate-limit";
import { requireCurrentUser } from "@/lib/supabase/server";
import { startCallSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, 20);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const user = await requireCurrentUser();
    const input = startCallSchema.parse(await request.json());
    const result = await startCall(user.id, input);
    return ok(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
