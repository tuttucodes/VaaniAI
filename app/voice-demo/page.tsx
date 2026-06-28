import Link from "next/link";
import { BrowserVoiceDemo } from "@/components/forms/browser-voice-demo";

export default function VoiceDemoPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-gradient-to-b from-white via-white to-[#dfe5ff] px-4 py-7 text-[#17161d]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-full bg-white px-6 py-4 shadow-[0_14px_50px_rgba(40,48,100,0.12)]">
        <Link href="/" className="text-3xl font-black tracking-[-0.04em] text-black">
          vaani
        </Link>
        <div className="hidden items-center gap-10 text-sm font-semibold uppercase tracking-[0.18em] text-[#25252d] md:flex">
          <span>Platform</span>
          <span>Developers</span>
          <span>Resources</span>
          <span>Company</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="rounded-full bg-[#202033] px-6 py-3 text-sm font-semibold text-white">
            Log in
          </Link>
          <Link href="/dashboard" className="hidden rounded-full border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-[#202033] sm:inline-flex">
            Dashboard
          </Link>
        </div>
      </nav>

      <section className="mx-auto flex max-w-7xl flex-col items-center gap-10 py-12">
        <h1 className="max-w-4xl text-center font-serif text-4xl font-medium leading-tight tracking-[-0.02em] text-[#28272e] md:text-6xl">
          The AI Voice Platform India Builds On
        </h1>
        <div className="w-full max-w-6xl">
          <BrowserVoiceDemo />
        </div>
      </section>
    </main>
  );
}
