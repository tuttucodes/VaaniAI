"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Agent } from "@/lib/types";

export function KnowledgeUploadForm({ agents, selectedAgentId }: { agents: Agent[]; selectedAgentId?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function uploadKnowledge(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/knowledge/upload", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error || "Upload failed");
        return;
      }
      setMessage(`Ready: ${payload.chunksCreated} chunks embedded`);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        uploadKnowledge(new FormData(event.currentTarget));
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="agent_id">Agent</FieldLabel>
          <Select
            id="agent_id"
            name="agent_id"
            defaultValue={selectedAgentId || agents[0]?.id}
            options={agents.map((agent) => ({ label: agent.name, value: agent.id }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="file">Knowledge file</FieldLabel>
          <Input id="file" name="file" type="file" accept=".pdf,.doc,.docx,.txt,.csv,.xlsx" required />
          <FieldDescription>Files are parsed and chunked before calls. RAG retrieves only top matching chunks live.</FieldDescription>
        </Field>
        <Button type="submit" disabled={isPending || agents.length === 0}>
          <Upload data-icon="inline-start" />
          {isPending ? "Processing..." : "Upload knowledge"}
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </FieldGroup>
    </form>
  );
}
