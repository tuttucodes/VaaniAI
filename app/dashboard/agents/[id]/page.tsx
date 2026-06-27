import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AgentForm } from "@/components/forms/agent-form";
import { KnowledgeUploadForm } from "@/components/forms/knowledge-upload-form";
import { StartCallForm } from "@/components/forms/start-call-form";
import { StatusPill } from "@/components/dashboard/status-pill";
import { getAgent, listAgents, listCalls, listKnowledgeFiles } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";
import { formatDuration, formatInr } from "@/lib/utils";

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const agent = await getAgent(user.id, id);
  if (!agent) notFound();

  const [agents, knowledgeFiles, calls] = await Promise.all([listAgents(user.id), listKnowledgeFiles(user.id, id), listCalls(user.id, id)]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <AgentForm agent={agent} />
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Outbound test</CardTitle>
              <CardDescription>Creates a LiveKit room and asks Vobiz to bridge the phone call.</CardDescription>
            </CardHeader>
            <CardContent>
              <StartCallForm agentId={agent.id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Knowledge upload</CardTitle>
              <CardDescription>Pre-process files before live calls.</CardDescription>
            </CardHeader>
            <CardContent>
              <KnowledgeUploadForm agents={agents} selectedAgentId={agent.id} />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Knowledge files</CardTitle>
            <CardDescription>Ready files are eligible for hybrid RAG.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {knowledgeFiles.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell>{file.filename}</TableCell>
                    <TableCell>
                      <StatusPill status={file.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent calls</CardTitle>
            <CardDescription>Live transcripts and post-call insights.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.slice(0, 5).map((call) => (
                  <TableRow key={call.id}>
                    <TableCell>
                      <Link className="font-medium text-primary" href={`/dashboard/calls/${call.id}`}>
                        {call.phone_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={call.status} />
                    </TableCell>
                    <TableCell>{formatDuration(call.duration_seconds)}</TableCell>
                    <TableCell>{formatInr(Number(call.total_cost_estimate || 0))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
