import { ok, fail, handleApiError } from "@/lib/api";
import { getCall, getCallInsights } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const call = await getCall(user.id, id);
    if (!call) return fail("Call not found", 404);
    const insights = await getCallInsights(user.id, id);
    return ok({ call, insights });
  } catch (error) {
    return handleApiError(error);
  }
}
