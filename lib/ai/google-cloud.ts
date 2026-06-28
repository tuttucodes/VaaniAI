import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GoogleAuth } from "google-auth-library";
import { getEnv } from "@/lib/env";

const execFileAsync = promisify(execFile);
const DEFAULT_VERTEX_LOCATION = "us-central1";
const DEFAULT_VERTEX_MODEL = "gemini-2.5-flash";
const DEFAULT_TTS_VOICE = "en-IN-Chirp3-HD-Aoede";
const TOKEN_TTL_MS = 45 * 60 * 1000;

let cachedProject = "";
let cachedToken = "";
let cachedTokenUntil = 0;
let authClientPromise: ReturnType<GoogleAuth["getClient"]> | null = null;

async function getGcloudValue(args: string[]) {
  try {
    const { stdout } = await execFileAsync("gcloud", args, { timeout: 8000 });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function getGoogleCloudProject() {
  if (cachedProject) return cachedProject;
  cachedProject =
    getEnv("GOOGLE_CLOUD_PROJECT") ||
    getEnv("GOOGLE_PROJECT_ID") ||
    getEnv("GCLOUD_PROJECT") ||
    (await getGcloudValue(["config", "get-value", "project"]));
  return cachedProject;
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenUntil) return cachedToken;
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"]
  });
  try {
    authClientPromise ||= auth.getClient();
    const client = await authClientPromise;
    const token = await client.getAccessToken();
    if (token.token) {
      cachedToken = token.token;
      cachedTokenUntil = Date.now() + TOKEN_TTL_MS;
      return cachedToken;
    }
  } catch {}

  cachedToken = await getGcloudValue(["auth", "print-access-token"]);
  cachedTokenUntil = cachedToken ? Date.now() + TOKEN_TTL_MS : 0;
  return cachedToken;
}

export async function generateVertexGeminiText({
  prompt,
  model = getEnv("VERTEX_GEMINI_MODEL") || DEFAULT_VERTEX_MODEL,
  location = getEnv("VERTEX_LOCATION") || DEFAULT_VERTEX_LOCATION,
  temperature = 0.35,
  maxOutputTokens = 90
}: {
  prompt: string;
  model?: string;
  location?: string;
  temperature?: number;
  maxOutputTokens?: number;
}) {
  const [project, token] = await Promise.all([getGoogleCloudProject(), getAccessToken()]);
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required for Vertex Gemini.");
  if (!token) throw new Error("Google Cloud auth is required for Vertex Gemini.");

  const response = await fetch(
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-goog-user-project": project
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature,
          maxOutputTokens
        }
      })
    }
  );

  if (!response.ok) throw new Error(`Vertex Gemini failed: ${response.status} ${await response.text()}`);

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
}

export async function transcribeVertexAudio({
  audio,
  mimeType,
  model = getEnv("VERTEX_STT_MODEL") || getEnv("VERTEX_GEMINI_MODEL") || DEFAULT_VERTEX_MODEL,
  location = getEnv("VERTEX_LOCATION") || DEFAULT_VERTEX_LOCATION
}: {
  audio: Buffer;
  mimeType: string;
  model?: string;
  location?: string;
}) {
  const [project, token] = await Promise.all([getGoogleCloudProject(), getAccessToken()]);
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required for Vertex Gemini STT.");
  if (!token) throw new Error("Google Cloud auth is required for Vertex Gemini STT.");

  const response = await fetch(
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-goog-user-project": project
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Transcribe this caller microphone audio for a live Indian voice agent. Return only the spoken words. Preserve Malayalam, Hindi, Tamil, Telugu, Kannada, Manglish, and English exactly as spoken. If there is no clear speech, return an empty string."
              },
              {
                inlineData: {
                  mimeType,
                  data: audio.toString("base64")
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 320
        }
      })
    }
  );

  if (!response.ok) throw new Error(`Vertex audio transcription failed: ${response.status} ${await response.text()}`);

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .trim() || ""
  );
}

export async function generateGoogleCloudTts({
  text,
  voice = getEnv("GOOGLE_TTS_VOICE") || DEFAULT_TTS_VOICE,
  speakingRate = Number(getEnv("GOOGLE_TTS_SPEAKING_RATE") || 1.04)
}: {
  text: string;
  voice?: string;
  speakingRate?: number;
}) {
  const [project, token] = await Promise.all([getGoogleCloudProject(), getAccessToken()]);
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required for Cloud Text-to-Speech.");
  if (!token) throw new Error("Google Cloud auth is required for Cloud Text-to-Speech.");

  const languageCode = voice.split("-").slice(0, 2).join("-") || "en-IN";
  const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-goog-user-project": project
    },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode,
        name: voice
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate,
        pitch: 0
      }
    })
  });

  if (!response.ok) throw new Error(`Cloud TTS failed: ${response.status} ${await response.text()}`);

  const data = (await response.json()) as { audioContent?: string };
  if (!data.audioContent) throw new Error("Cloud TTS returned no audio.");

  return {
    audioBase64: data.audioContent,
    mimeType: "audio/mpeg" as const
  };
}

function stripWavHeaderIfPresent(audio: Buffer) {
  if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") {
    return audio;
  }

  let offset = 12;
  while (offset + 8 <= audio.length) {
    const chunkId = audio.toString("ascii", offset, offset + 4);
    const chunkSize = audio.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > audio.length) break;
    if (chunkId === "data") return audio.subarray(chunkStart, chunkEnd);
    offset = chunkEnd + (chunkSize % 2);
  }

  return audio;
}

export async function generateGoogleCloudTtsPcm8khz({
  text,
  voice = getEnv("GOOGLE_TTS_PHONE_VOICE") || getEnv("GOOGLE_TTS_VOICE") || DEFAULT_TTS_VOICE,
  speakingRate = Number(getEnv("GOOGLE_TTS_PHONE_SPEAKING_RATE") || getEnv("GOOGLE_TTS_SPEAKING_RATE") || 1.04)
}: {
  text: string;
  voice?: string;
  speakingRate?: number;
}) {
  const [project, token] = await Promise.all([getGoogleCloudProject(), getAccessToken()]);
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required for Cloud Text-to-Speech.");
  if (!token) throw new Error("Google Cloud auth is required for Cloud Text-to-Speech.");

  const languageCode = voice.split("-").slice(0, 2).join("-") || "en-IN";
  const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-goog-user-project": project
    },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode,
        name: voice
      },
      audioConfig: {
        audioEncoding: "LINEAR16",
        sampleRateHertz: 8000,
        speakingRate,
        pitch: 0
      }
    })
  });

  if (!response.ok) throw new Error(`Cloud phone TTS failed: ${response.status} ${await response.text()}`);

  const data = (await response.json()) as { audioContent?: string };
  if (!data.audioContent) throw new Error("Cloud phone TTS returned no audio.");
  return stripWavHeaderIfPresent(Buffer.from(data.audioContent, "base64"));
}
