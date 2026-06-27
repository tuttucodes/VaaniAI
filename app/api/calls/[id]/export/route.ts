import type { NextRequest } from "next/server";
import { fail, handleApiError } from "@/lib/api";
import { exportCallData } from "@/lib/calls/data-controls";
import { rateLimit } from "@/lib/rate-limit";
import { requireCurrentUser } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = rateLimit(request, 20);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const user = await requireCurrentUser();
    const { id } = await params;
    const bundle = await exportCallData(user.id, id);
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="vaani-call-${id}.json"`
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
