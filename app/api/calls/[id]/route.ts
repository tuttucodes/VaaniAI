import type { NextRequest } from "next/server";
import { ok, fail, handleApiError } from "@/lib/api";
import { deleteCallData, exportCallData } from "@/lib/calls/data-controls";
import { getCall } from "@/lib/data";
import { rateLimit } from "@/lib/rate-limit";
import { requireCurrentUser } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = rateLimit(request);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const user = await requireCurrentUser();
    const { id } = await params;
    const call = await getCall(user.id, id);
    if (!call) return fail("Call not found", 404);
    return ok({ call });
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
    const result = await deleteCallData(user.id, id);
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = rateLimit(request, 20);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const action = request.nextUrl.searchParams.get("action");
    if (action !== "export") return fail("Unsupported action", 400);

    const user = await requireCurrentUser();
    const { id } = await params;
    const bundle = await exportCallData(user.id, id);
    return ok(bundle);
  } catch (error) {
    return handleApiError(error);
  }
}
