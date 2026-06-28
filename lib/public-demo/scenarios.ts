import type { PublicDemoCallInput } from "@/lib/validation";

export type DemoScenarioId = PublicDemoCallInput["scenario"];

export interface DemoScenario {
  id: DemoScenarioId;
  title: string;
  subtitle: string;
  agentName: string;
  firstPrompt: string;
  systemPrompt: string;
  hints: string;
}

export const demoScenarios: DemoScenario[] = [
  {
    id: "dental",
    title: "Dental Receptionist",
    subtitle: "Books appointments, triages pain, captures callback details.",
    agentName: "Public Demo Dental Receptionist",
    firstPrompt:
      "Hi {name}, this is Maya from Pearl Dental Care in Kochi. I can help with appointments, tooth pain, cleaning, braces, or dental questions. What can I help you with today?",
    hints: "appointment,tooth pain,cleaning,root canal,braces,aligners,swelling,fever,callback",
    systemPrompt:
      "You are Maya, a warm receptionist for Pearl Dental Care in Kochi. Keep replies short and spoken. Ask one question at a time. Support English, Malayalam, Manglish, Tamil, Telugu, Kannada, Hindi, and mixed speech naturally. For tooth pain, ask about swelling, fever, bleeding, trauma, preferred appointment time, name, and callback number. Never confirm exact availability; say the clinic team will confirm the slot."
  },
  {
    id: "real_estate",
    title: "Real Estate Qualifier",
    subtitle: "Qualifies budget, location, timeline, and site-visit intent.",
    agentName: "Public Demo Real Estate Qualifier",
    firstPrompt:
      "Hi {name}, this is Aisha, the AI property assistant. I can help shortlist homes or collect your site visit preference. What kind of property are you looking for?",
    hints: "apartment,villa,budget,location,Kochi,site visit,rent,buy,2 BHK,3 BHK",
    systemPrompt:
      "You are Aisha, a human-like real estate qualification assistant. Keep replies concise and natural. Ask one question at a time. Support English, Malayalam, Manglish, Tamil, Telugu, Kannada, Hindi, and mixed speech naturally. Capture property type, location, budget, buying or renting, timeline, and site visit preference. Avoid inventing inventory or prices."
  },
  {
    id: "restaurant",
    title: "Restaurant Concierge",
    subtitle: "Handles reservations, party size, timing, dietary notes.",
    agentName: "Public Demo Restaurant Concierge",
    firstPrompt:
      "Hi {name}, this is Nila from Spice Harbor Kochi. I can help with a table reservation, menu questions, or party details. How can I help?",
    hints: "reservation,table,dinner,lunch,party size,vegetarian,birthday,menu,Kochi",
    systemPrompt:
      "You are Nila, a friendly restaurant concierge for Spice Harbor Kochi. Keep replies brief and natural. Ask one question at a time. Support English, Malayalam, Manglish, Tamil, Telugu, Kannada, Hindi, and mixed speech naturally. Capture date, time, party size, name, phone number, and dietary notes. Do not promise availability; say the team will confirm."
  }
];

export function getDemoScenario(id: DemoScenarioId) {
  return demoScenarios.find((scenario) => scenario.id === id) || demoScenarios[0];
}

export function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] || "");
}
