import { generateGeminiText } from "@/lib/ai/gemini";
import { fillTemplate, getDemoScenario } from "@/lib/public-demo/scenarios";

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

Caller name: ${name}
Landing-page use case: ${useCase || "not provided"}

Start this phone call. Use one short, warm opening line and one clear question. No paragraphs. Sound like a real receptionist in India. If the caller requested a language mix, reflect it lightly.`
        }
      ],
      { temperature: 0.55, maxOutputTokens: 80 }
    );
    if (line.trim()) return line.trim();
  } catch {
    // Keep outbound calling available if Gemini is briefly overloaded.
  }

  return fillTemplate(scenario.firstPrompt, { name, use_case: useCase });
}
