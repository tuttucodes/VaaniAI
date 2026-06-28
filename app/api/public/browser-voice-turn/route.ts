import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { transcribeVertexAudio } from "@/lib/ai/google-cloud";
import { orchestrateBrowserVoiceTurn } from "@/lib/voice/orchestrator";

const FRIENDLY_AUDIO_ERROR = "Sorry, I could not process the audio. Please try again.";
const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  return "webm";
}

async function normalizeForStt(buffer: Buffer, mimeType: string) {
  if (mimeType.includes("wav")) return { audio: buffer, mimeType: "audio/wav" };

  const dir = path.join(tmpdir(), `vaani-audio-${randomUUID()}`);
  const inputPath = path.join(dir, `input.${extensionForMimeType(mimeType)}`);
  const outputPath = path.join(dir, "output.wav");

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(inputPath, buffer);
    await execFileAsync(
      "ffmpeg",
      ["-y", "-hide_banner", "-loglevel", "error", "-i", inputPath, "-ac", "1", "-ar", "16000", "-f", "wav", outputPath],
      { timeout: 12000 }
    );
    return { audio: await readFile(outputPath), mimeType: "audio/wav" };
  } catch {
    return { audio: buffer, mimeType };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) return fail("Missing audio", 400);

  const started = performance.now();
  const buffer = Buffer.from(await audio.arrayBuffer());
  let transcript = "";

  try {
    const normalized = await normalizeForStt(buffer, audio.type || "audio/webm");
    transcript = await transcribeVertexAudio({
      audio: normalized.audio,
      mimeType: normalized.mimeType
    });
  } catch {
    return ok({
      transcript: "",
      reply: "",
      audio_base64: "",
      audio_mime: "audio/mpeg",
      audio_error: FRIENDLY_AUDIO_ERROR,
      latency_ms: Math.round(performance.now() - started),
      cached: false
    });
  }

  if (!transcript) {
    return ok({
      transcript: "",
      reply: "",
      audio_base64: "",
      audio_mime: "audio/mpeg",
      audio_error: "",
      latency_ms: Math.round(performance.now() - started),
      cached: false
    });
  }

  const result = await orchestrateBrowserVoiceTurn({
    event: "turn",
    transcript,
    scenario: form.get("scenario"),
    scenarioId: form.get("scenario_id") || form.get("scenarioId"),
    context: form.get("context"),
    history: form.get("history")
  });

  return ok({
    ...result,
    latency_ms: Math.round(performance.now() - started)
  });
}
