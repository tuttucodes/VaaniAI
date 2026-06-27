import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KnowledgeUploadForm } from "@/components/forms/knowledge-upload-form";
import { StatusPill } from "@/components/dashboard/status-pill";
import { listAgents, listKnowledgeFiles } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";

export default async function KnowledgePage() {
  const user = await requireCurrentUser();
  const [agents, files] = await Promise.all([listAgents(user.id), listKnowledgeFiles(user.id)]);

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Upload knowledge</CardTitle>
          <CardDescription>PDF, DOCX, TXT, CSV, XLSX. Chunks are embedded once.</CardDescription>
        </CardHeader>
        <CardContent>
          <KnowledgeUploadForm agents={agents} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Knowledge files</CardTitle>
          <CardDescription>Fast semantic and keyword retrieval filtered by agent.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell>{file.filename}</TableCell>
                  <TableCell>{agents.find((agent) => agent.id === file.agent_id)?.name || "Agent"}</TableCell>
                  <TableCell>{file.file_type}</TableCell>
                  <TableCell>
                    <StatusPill status={file.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
