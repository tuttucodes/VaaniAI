"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CallDataActions({ callId }: { callId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function exportData() {
    window.location.href = `/api/calls/${callId}/export`;
  }

  function deleteData() {
    const confirmed = window.confirm("Delete this call, transcript, metrics, insights, leads, and references?");
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/calls/${callId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error || "Could not delete call");
        return;
      }
      router.push("/dashboard/calls");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button variant="outline" onClick={exportData}>
          <Download data-icon="inline-start" />
          Export
        </Button>
        <Button variant="destructive" onClick={deleteData} disabled={isPending}>
          <Trash2 data-icon="inline-start" />
          {isPending ? "Deleting..." : "Delete"}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
