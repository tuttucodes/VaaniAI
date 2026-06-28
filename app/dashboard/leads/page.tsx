import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listLeads } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";

function leadStatusLabel(status: string | null) {
  if (!status || status === "new") return "New";
  if (status === "qualified") return "Qualified";
  if (status === "follow_up") return "Follow-up";
  if (status === "closed") return "Closed";
  return status.replaceAll("_", " ");
}

export default async function LeadsPage() {
  const user = await requireCurrentUser();
  const leads = await listLeads(user.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leads</CardTitle>
        <CardDescription>People and businesses captured from calls, ready for follow-up.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Requirement</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Timeline</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Call</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.name || "Unknown caller"}</TableCell>
                <TableCell>
                  <div>{lead.phone || "No phone saved"}</div>
                  {lead.email ? <div className="text-xs text-muted-foreground">{lead.email}</div> : null}
                </TableCell>
                <TableCell>{lead.company || "Not captured"}</TableCell>
                <TableCell className="max-w-sm text-muted-foreground">{lead.requirement || "Requirement not captured yet."}</TableCell>
                <TableCell>{lead.budget || "Not discussed"}</TableCell>
                <TableCell>{lead.timeline || "Not discussed"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{leadStatusLabel(lead.status)}</Badge>
                </TableCell>
                <TableCell>
                  <Link className="text-sm font-medium text-primary" href={`/dashboard/calls/${lead.call_id}`}>
                    Review
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {!leads.length ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No leads yet. When callers share contact details or buying intent, they will appear here.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
