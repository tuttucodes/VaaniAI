import type { NextRequest } from "next/server";
import { ok, fail, handleApiError } from "@/lib/api";
import { toAgentPatch } from "@/lib/agent-config";
import { getAgent } from "@/lib/data";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
import { agentPatchSchema } from "@/lib/validation";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const agent = await getAgent(user.id, id);
    if (!agent) return fail("Agent not found", 404);
    return ok({ agent });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = rateLimit(request, 30);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const user = await requireCurrentUser();
    const { id } = await params;
    const input = agentPatchSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();

    if (!supabase) {
      return ok({ agent: { ...(await getAgent(user.id, id)), ...input }, demo: true });
    }

    const { data, error } = await supabase
      .from("agents")
      .update(toAgentPatch(input))
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (error) throw error;
    return ok({ agent: data, demo: false });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = rateLimit(request, 20);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const user = await requireCurrentUser();
    const { id } = await params;
    const supabase = createSupabaseAdminClient();
    if (!supabase) return ok({ deleted: true, demo: true });

    const { error } = await supabase.from("agents").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw error;
    return ok({ deleted: true, demo: false });
  } catch (error) {
    return handleApiError(error);
  }
}
