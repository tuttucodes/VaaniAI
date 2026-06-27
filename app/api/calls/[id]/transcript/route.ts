import { ok, fail, handleApiError } from "@/lib/api";
import { getCall, listCallMessages } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const call = await getCall(user.id, id);
    if (!call) return fail("Call not found", 404);
    const messages = await listCallMessages(user.id, id);
    return ok({ call, messages });
  } catch (error) {
    return handleApiError(error);
  }
}
