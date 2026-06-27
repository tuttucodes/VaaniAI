import type { ParsedDocumentSection } from "@/lib/documents/parser";

export interface KnowledgeChunkInput {
  content: string;
  summary: string;
  keywords: string[];
  token_count: number;
  source_reference: string;
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "you",
  "your",
  "are",
  "was",
  "were",
  "will",
  "have",
  "has",
  "can",
  "not",
  "but",
  "all",
  "our"
]);

export function estimateTokens(text: string) {
  return Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.25);
}

function summarize(text: string) {
  const firstLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
  return firstLines.slice(0, 320);
}

function extractKeywords(text: string) {
  const counts = new Map<string, number>();
  for (const token of text.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || []) {
    if (STOP_WORDS.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([word]) => word);
}

function chunkWords(words: string[], targetTokens = 720, overlapTokens = 100) {
  const chunks: string[] = [];
  const targetWords = Math.floor(targetTokens / 1.25);
  const overlapWords = Math.floor(overlapTokens / 1.25);

  for (let start = 0; start < words.length; start += Math.max(1, targetWords - overlapWords)) {
    const slice = words.slice(start, start + targetWords);
    if (slice.length === 0) break;
    chunks.push(slice.join(" "));
    if (start + targetWords >= words.length) break;
  }

  return chunks;
}

export function createKnowledgeChunks(sections: ParsedDocumentSection[]): KnowledgeChunkInput[] {
  return sections.flatMap((section) => {
    const normalized = section.text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
    if (!normalized) return [];

    const words = normalized.split(/\s+/);
    const rawChunks = estimateTokens(normalized) <= 900 ? [normalized] : chunkWords(words);

    return rawChunks.map((content, index) => ({
      content,
      summary: summarize(content),
      keywords: extractKeywords(content),
      token_count: estimateTokens(content),
      source_reference: rawChunks.length > 1 ? `${section.sourceReference}, chunk ${index + 1}` : section.sourceReference
    }));
  });
}

export function compactRetrievedContext(chunks: Array<{ content: string; summary: string | null; source_reference: string | null }>) {
  return chunks
    .map((chunk, index) => {
      const source = chunk.source_reference ? `Source: ${chunk.source_reference}` : "Source: uploaded knowledge";
      const body = chunk.summary && chunk.summary.length > 80 ? `${chunk.summary}\n${chunk.content.slice(0, 700)}` : chunk.content;
      return `[K${index + 1}] ${source}\n${body.slice(0, 1000)}`;
    })
    .join("\n\n")
    .slice(0, 4200);
}
