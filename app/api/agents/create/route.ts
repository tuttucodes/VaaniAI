import type { NextRequest } from "next/server";
import { ok, fail, handleApiError } from "@/lib/api";
import { toAgentInsert } from "@/lib/agent-config";
import { demoAgent } from "@/lib/demo-data";
import { ensureUserRecord } from "@/lib/auth/ensure-user";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
import { agentSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, 20);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const user = await requireCurrentUser();
    await ensureUserRecord(user);
    const input = agentSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();

    if (!supabase) {
      return ok({
        agent: {
          ...demoAgent,
          ...toAgentInsert(input, user.id),
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        demo: true
      });
    }

    const { data, error } = await supabase.from("agents").insert(toAgentInsert(input, user.id)).select("*").single();
    if (error) throw error;

    return ok({ agent: data, demo: false }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
