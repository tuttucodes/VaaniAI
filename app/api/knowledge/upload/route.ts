import type { NextRequest } from "next/server";
import { ok, fail, handleApiError } from "@/lib/api";
import { uploadKnowledgeFile } from "@/lib/knowledge/service";
import { rateLimit } from "@/lib/rate-limit";
import { requireCurrentUser } from "@/lib/supabase/server";

const MAX_KNOWLEDGE_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".txt", ".csv", ".xlsx"];

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, 12);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const user = await requireCurrentUser();
    const formData = await request.formData();
    const agentId = String(formData.get("agent_id") || "");
    const file = formData.get("file");

    if (!agentId) return fail("agent_id is required", 422);
    if (!(file instanceof File)) return fail("file is required", 422);
    if (file.size > MAX_KNOWLEDGE_FILE_BYTES) return fail("Knowledge file must be 25 MB or smaller", 413);

    const lowerName = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
      return fail("Unsupported knowledge file type", 422);
    }

    const result = await uploadKnowledgeFile({ userId: user.id, agentId, file });
    return ok(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
