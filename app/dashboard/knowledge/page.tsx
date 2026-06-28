import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KnowledgeUploadForm } from "@/components/forms/knowledge-upload-form";
import { StatusPill } from "@/components/dashboard/status-pill";
import { listAgents, listKnowledgeFiles } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";

function fileTypeLabel(fileType: string) {
  const normalized = fileType.toLowerCase();
  if (normalized.includes("pdf")) return "PDF";
  if (normalized.includes("word") || normalized.includes("doc")) return "Document";
  if (normalized.includes("sheet") || normalized.includes("excel") || normalized.includes("csv")) return "Spreadsheet";
  if (normalized.includes("text") || normalized.includes("plain")) return "Text";
  return fileType || "File";
}

export default async function KnowledgePage() {
  const user = await requireCurrentUser();
  const [agents, files] = await Promise.all([listAgents(user.id), listKnowledgeFiles(user.id)]);

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Add business knowledge</CardTitle>
          <CardDescription>Upload brochures, price lists, FAQs, or policy notes for agents to use during calls.</CardDescription>
        </CardHeader>
        <CardContent>
          <KnowledgeUploadForm agents={agents} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Knowledge files</CardTitle>
          <CardDescription>Files connected to agents, with a simple status for demo review.</CardDescription>
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
                  <TableCell className="font-medium">{file.filename}</TableCell>
                  <TableCell>{agents.find((agent) => agent.id === file.agent_id)?.name || "Agent"}</TableCell>
                  <TableCell>{fileTypeLabel(file.file_type)}</TableCell>
                  <TableCell>
                    <StatusPill status={file.status} />
                  </TableCell>
                </TableRow>
              ))}
              {!files.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No files yet. Upload business FAQs, pricing, or product notes to make answers more useful.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
