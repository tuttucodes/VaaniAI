import { LoginForm } from "@/components/forms/login-form";
import { Waveform } from "@/components/dashboard/waveform";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 bg-background lg:grid-cols-[1fr_520px]">
      <section className="hidden border-r p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">V</div>
          <div>
            <div className="font-semibold">Vaani AI Voice</div>
            <div className="text-sm text-muted-foreground">Human phone agents for Indian teams</div>
          </div>
        </div>
        <div className="max-w-2xl">
          <Waveform className="mb-8" />
          <h1 className="text-4xl font-semibold tracking-normal">Human-like voice agents with measurable latency and cost.</h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Build agents, upload knowledge, place calls, watch transcripts live, and approve reusable learnings.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm text-muted-foreground">
          <div>Target under 300 ms perceived latency</div>
          <div>Knowledge prefetch on partial transcripts</div>
          <div>Cost controls under ₹2-₹3 per minute</div>
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <LoginForm />
      </section>
    </main>
  );
}
