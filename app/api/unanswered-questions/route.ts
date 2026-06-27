import { ok, handleApiError } from "@/lib/api";
import { listUnansweredQuestions } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const unansweredQuestions = await listUnansweredQuestions(user.id);
    return ok({ unanswered_questions: unansweredQuestions });
  } catch (error) {
    return handleApiError(error);
  }
}
