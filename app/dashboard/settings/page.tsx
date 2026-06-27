import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { providerStatus } from "@/lib/env";

export default function SettingsPage() {
  const status = providerStatus();
  const checks = [
    { label: "Mode", ok: status.demoMode, env: status.demoMode ? "Demo mode enabled" : "Production runtime" },
    { label: "Supabase Postgres/Auth/Storage", ok: status.supabase, env: "NEXT_PUBLIC_SUPABASE_URL, ANON, SERVICE_ROLE" },
    { label: "Gemini API", ok: status.gemini, env: "GEMINI_API_KEY" },
    { label: "LiveKit", ok: status.livekit, env: "LIVEKIT_URL, API_KEY, API_SECRET" },
    { label: "Vobiz", ok: status.vobiz, env: "VOBIZ_BASE_URL, API_KEY, WEBHOOK_SECRET" }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Provider health and required secrets. Secrets stay server-side.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {checks.map((check) => (
          <div key={check.label}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">{check.label}</div>
                <div className="text-sm text-muted-foreground">{check.env}</div>
              </div>
              <Badge variant={check.ok ? "default" : "secondary"}>{check.ok ? "configured" : "demo mode"}</Badge>
            </div>
            <Separator className="mt-4" />
          </div>
        ))}
        <div className="rounded-md border bg-secondary p-4 text-sm text-muted-foreground">
          Vobiz adapter TODOs are isolated in <span className="font-medium text-foreground">lib/telephony/vobiz.ts</span> for exact API paths,
          headers, SIP bridge details, and webhook payload mapping.
        </div>
      </CardContent>
    </Card>
  );
}
