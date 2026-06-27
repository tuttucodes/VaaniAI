import { Badge } from "@/components/ui/badge";
import type { CallStatus, KnowledgeStatus, LearningStatus } from "@/lib/types";

export function StatusPill({ status }: { status: CallStatus | KnowledgeStatus | LearningStatus | string }) {
  const variant =
    status === "failed" || status === "rejected"
      ? "destructive"
      : status === "completed" || status === "ready" || status === "approved"
        ? "default"
        : status === "pending" || status === "processing" || status === "queued"
          ? "secondary"
          : "outline";

  return <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>;
}
