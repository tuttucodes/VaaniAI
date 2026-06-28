import { generateGeminiText } from "@/lib/ai/gemini";
import { fillTemplate, getDemoScenario } from "@/lib/public-demo/scenarios";

function cleanOpeningLine(value: string) {
  const line = value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^["'“”`]+|["'“”`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (line.length < 32) return "";
  if (!/[.?!]$/.test(line)) return `${line}.`;
  return line;
}

export async function generateDemoOpeningLine({
  name,
  useCase,
  scenario
}: {
  name: string;
  useCase: string;
  scenario: ReturnType<typeof getDemoScenario>;
}) {
  try {
    const line = await generateGeminiText(
      [
        {
          role: "user",
          text: `${scenario.systemPrompt}

Caller name: ${scenario.id === "dental" ? "unknown until the caller confirms it in the live call" : name}
Landing-page use case: ${useCase || "not provided"}

Start this phone call. Use one short, warm opening line and one clear question.
The landing-page use case is background context only. Do not quote it, roleplay it as the caller, or say "I had..." on behalf of the caller.
For dental calls, do not use the form name in the opening line.
Do not ask to record the call. Do not mention call quality, recording consent, automation, or internal policy.
No paragraphs. Sound like a real receptionist in India. If the caller requested a language mix, reflect it lightly.`
        }
      ],
      { temperature: 0.55, maxOutputTokens: 80 }
    );
    const cleanLine = cleanOpeningLine(line);
    if (cleanLine) return cleanLine;
  } catch {
    // Keep outbound calling available if Gemini is briefly overloaded.
  }

  return fillTemplate(scenario.firstPrompt, { name, use_case: useCase });
}
