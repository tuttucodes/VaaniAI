import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/dashboard/status-pill";
import { listAgents, listKnowledgeFiles, listCalls } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";

export default async function AgentsPage() {
  const user = await requireCurrentUser();
  const [agents, knowledgeFiles, calls] = await Promise.all([listAgents(user.id), listKnowledgeFiles(user.id), listCalls(user.id)]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Agents</CardTitle>
          <CardDescription>Configure prompts, latency modes, Vobiz settings, and knowledge retrieval.</CardDescription>
        </div>
        <Button asChild>
          <Link href="/dashboard/agents/new">
            <Plus data-icon="inline-start" />
            New agent
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Cost mode</TableHead>
              <TableHead>Knowledge</TableHead>
              <TableHead>Calls</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell>
                  <div className="font-medium">{agent.name}</div>
                  <div className="text-xs text-muted-foreground">{agent.description}</div>
                </TableCell>
                <TableCell>{agent.language}</TableCell>
                <TableCell>
                  <StatusPill status={String(agent.cost_config?.mode || "economy")} />
                </TableCell>
                <TableCell>{knowledgeFiles.filter((file) => file.agent_id === agent.id).length}</TableCell>
                <TableCell>{calls.filter((call) => call.agent_id === agent.id).length}</TableCell>
                <TableCell>
                  <Link className="text-sm font-medium text-primary" href={`/dashboard/agents/${agent.id}`}>
                    Configure
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
