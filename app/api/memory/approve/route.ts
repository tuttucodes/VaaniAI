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
    if (!supabase) return ok({ approved: true, demo: true });

    const { data: learning, error } = await supabase
      .from("agent_learning_events")
      .select("*, agents!inner(user_id)")
      .eq("id", input.learning_id)
      .eq("agents.user_id", user.id)
      .single();
    if (error) throw error;

    const content = input.edited_content || learning.suggested_learning;
    await supabase.from("agent_memory").insert({
      agent_id: learning.agent_id,
      source_call_id: learning.source_call_id,
      content,
      category: "approved_learning",
      confidence_score: learning.confidence_score,
      approved_by_user: true
    });

    await supabase.from("agent_learning_events").update({ status: "approved" }).eq("id", input.learning_id);
    return ok({ approved: true, content, demo: false });
  } catch (error) {
    return handleApiError(error);
  }
}
