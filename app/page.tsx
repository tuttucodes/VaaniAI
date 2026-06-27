import Link from "next/link";
import { ArrowRight, Gauge, ShieldCheck, Waves } from "lucide-react";
import { DemoSignalPanel, PublicDemoCallForm } from "@/components/forms/public-demo-call-form";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">V</div>
            <div>
              <div className="text-sm font-semibold">Vaani AI</div>
              <div className="text-xs text-muted-foreground">Voice agent infrastructure</div>
            </div>
          </Link>
          <Button asChild variant="outline">
            <Link href="/dashboard">
              Dashboard
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:py-16">
        <div className="flex flex-col justify-center">
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal md:text-6xl">
            Vaani AI voice agents that can call, listen, and learn.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
            Trigger a real phone demo, then inspect transcripts, latency, leads, and approved memory in the dashboard.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-4">
              <Gauge className="mb-4 size-5 text-primary" />
              <div className="text-sm font-semibold">Sub-second path</div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">LiveKit SIP and worker-ready orchestration.</p>
            </div>
            <div className="rounded-md border p-4">
              <Waves className="mb-4 size-5 text-primary" />
              <div className="text-sm font-semibold">Human turns</div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Short responses, speech gather, and memory loops.</p>
            </div>
            <div className="rounded-md border p-4">
              <ShieldCheck className="mb-4 size-5 text-primary" />
              <div className="text-sm font-semibold">User approval</div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Learnings become memory only after approval.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-5">
          <section className="rounded-md border bg-card p-5 shadow-panel">
            <div className="mb-5">
              <h2 className="text-xl font-semibold tracking-normal">Get a sample call</h2>
              <p className="mt-2 text-sm text-muted-foreground">Choose a scenario, enter a number in E.164 format, and Vaani will call.</p>
            </div>
            <PublicDemoCallForm />
          </section>
          <DemoSignalPanel />
        </div>
      </section>
    </main>
  );
}
