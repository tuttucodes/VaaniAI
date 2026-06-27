import type { NextRequest } from "next/server";
import { ok, fail, handleApiError } from "@/lib/api";
import { createLiveKitToken } from "@/lib/livekit/server";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient, requireCurrentUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/env";
import { liveKitTokenSchema } from "@/lib/validation";

async function assertRoomAccess(userId: string, roomName: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase && isDemoMode()) return;
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("calls")
    .select("id")
    .eq("user_id", userId)
    .eq("livekit_room_name", roomName)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Unauthorized");
}

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, 60);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const user = await requireCurrentUser();
    const input = liveKitTokenSchema.parse(await request.json());
    await assertRoomAccess(user.id, input.room_name);
    const result = await createLiveKitToken({
      roomName: input.room_name,
      identity: input.identity,
      name: input.name
    });
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
