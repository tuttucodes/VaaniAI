import type { NextRequest } from "next/server";
import { ok, fail, handleApiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
import { memoryDecisionSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const limited = rateLimit(request, 30);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const input = memoryDecisionSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    if (!supabase) return ok({ rejected: true, demo: true });

    const { error } = await supabase
      .from("agent_learning_events")
      .update({ status: "rejected" })
      .eq("id", input.learning_id)
      .eq("status", "pending")
      .in(
        "agent_id",
        (
          await supabase.from("agents").select("id").eq("user_id", user.id)
        ).data?.map((agent) => agent.id) || []
      );
    if (error) throw error;

    return ok({ rejected: true, demo: false });
  } catch (error) {
    return handleApiError(error);
  }
}
