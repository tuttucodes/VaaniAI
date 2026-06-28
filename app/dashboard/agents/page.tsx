import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAgents, listKnowledgeFiles, listCalls } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";

function languageLabel(language: string) {
  if (language === "multilingual-IN" || language === "mixed-IN") return "Multilingual";
  return language;
}

function preferenceLabel(mode: unknown) {
  if (mode === "quality") return "Best answers";
  if (mode === "balanced") return "Balanced";
  return "Lower cost";
}

export default async function AgentsPage() {
  const user = await requireCurrentUser();
  const [agents, knowledgeFiles, calls] = await Promise.all([listAgents(user.id), listKnowledgeFiles(user.id), listCalls(user.id)]);
  const knowledgeByAgent = new Map<string, number>();
  const callsByAgent = new Map<string, number>();

  for (const file of knowledgeFiles) {
    knowledgeByAgent.set(file.agent_id, (knowledgeByAgent.get(file.agent_id) || 0) + 1);
  }

  for (const call of calls) {
    callsByAgent.set(call.agent_id, (callsByAgent.get(call.agent_id) || 0) + 1);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Voice agents</CardTitle>
          <CardDescription>Each agent represents one caller experience, such as sales, support, or appointment booking.</CardDescription>
        </div>
        <Button asChild>
          <Link href="/dashboard/agents/new">
            <Plus data-icon="inline-start" />
            Add agent
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Caller languages</TableHead>
              <TableHead>Preference</TableHead>
              <TableHead>Knowledge</TableHead>
              <TableHead>Calls</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell>
                  <div className="font-medium">{agent.name}</div>
                  <div className="max-w-md text-xs text-muted-foreground">{agent.description || "Ready to be tailored for a caller journey."}</div>
                </TableCell>
                <TableCell>{languageLabel(agent.language)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{preferenceLabel(agent.cost_config?.mode)}</Badge>
                </TableCell>
                <TableCell>{knowledgeByAgent.get(agent.id) || 0} files</TableCell>
                <TableCell>{callsByAgent.get(agent.id) || 0}</TableCell>
                <TableCell>
                  <Link className="text-sm font-medium text-primary" href={`/dashboard/agents/${agent.id}`}>
                    Open
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {!agents.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Add your first voice agent to start answering calls and collecting leads.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
