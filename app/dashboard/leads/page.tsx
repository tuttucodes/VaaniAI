import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/dashboard/status-pill";
import { listLeads } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";

export default async function LeadsPage() {
  const user = await requireCurrentUser();
  const leads = await listLeads(user.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extracted leads</CardTitle>
        <CardDescription>Lead records are created by post-call analysis and linked to calls.</CardDescription>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>{lead.name || "Unknown"}</TableCell>
                <TableCell>
                  <div>{lead.phone}</div>
                  <div className="text-xs text-muted-foreground">{lead.email}</div>
                </TableCell>
                <TableCell>{lead.company}</TableCell>
                <TableCell className="max-w-sm">{lead.requirement}</TableCell>
                <TableCell>{lead.budget}</TableCell>
                <TableCell>{lead.timeline}</TableCell>
                <TableCell>
                  <StatusPill status={lead.status || "new"} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
