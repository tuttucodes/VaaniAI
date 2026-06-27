"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MemoryActions({ learningId }: { learningId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function decide(action: "approve" | "reject") {
    startTransition(async () => {
      await fetch(`/api/memory/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ learning_id: learningId })
      });
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => decide("approve")} disabled={isPending}>
        <Check data-icon="inline-start" />
        Approve
      </Button>
      <Button size="sm" variant="outline" onClick={() => decide("reject")} disabled={isPending}>
        <X data-icon="inline-start" />
        Reject
      </Button>
    </div>
  );
}
