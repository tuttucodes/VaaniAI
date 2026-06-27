"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function StartCallForm({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startCall(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          phone_number: String(formData.get("phone_number") || ""),
          direction: "outbound"
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Unable to start call");
        return;
      }
      router.push(`/dashboard/calls/${payload.call.id}`);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        startCall(new FormData(event.currentTarget));
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="phone_number">Outbound test call</FieldLabel>
          <div className="flex gap-2">
            <Input id="phone_number" name="phone_number" placeholder="+91..." required />
            <Button type="submit" disabled={isPending}>
              <PhoneCall data-icon="inline-start" />
              {isPending ? "Calling..." : "Start call"}
            </Button>
          </div>
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </FieldGroup>
    </form>
  );
}
