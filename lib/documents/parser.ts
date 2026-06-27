import mammoth from "mammoth";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/node";

export interface ParsedDocumentSection {
  text: string;
  sourceReference: string;
}

export interface ParsedDocument {
  fileType: string;
  sections: ParsedDocumentSection[];
}

function bufferToText(buffer: Buffer) {
  return buffer.toString("utf8").replace(/\u0000/g, "").trim();
}

function rowsToMarkdown(rows: unknown[][], sheetName: string) {
  return rows
    .filter((row) => row.some((cell) => String(cell ?? "").trim()))
    .map((row, index) => {
      const cells = row.map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim());
      return `Row ${index + 1}: | ${cells.join(" | ")} |`;
    })
    .join("\n");
}

async function parsePdf(buffer: Buffer): Promise<ParsedDocumentSection[]> {
  const pdfParse = (await import("pdf-parse")).default;
  const parsed = await pdfParse(buffer);
  return [
    {
      text: parsed.text.trim(),
      sourceReference: "PDF text"
    }
  ];
}

async function parseDocx(buffer: Buffer): Promise<ParsedDocumentSection[]> {
  const parsed = await mammoth.extractRawText({ buffer });
  return [
    {
      text: parsed.value.trim(),
      sourceReference: "DOCX body"
    }
  ];
}

function parseCsv(buffer: Buffer): ParsedDocumentSection[] {
  const text = bufferToText(buffer);
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = parsed.data.map((row) => row.map((cell) => cell ?? ""));
  return [
    {
      text: rowsToMarkdown(rows, "CSV"),
      sourceReference: "CSV rows"
    }
  ];
}

async function parseXlsx(buffer: Buffer): Promise<ParsedDocumentSection[]> {
  const sheets = await readXlsxFile(buffer);
  return sheets
    .map((sheet) => ({
      text: `Sheet: ${sheet.sheet}\n${rowsToMarkdown(sheet.data, sheet.sheet)}`,
      sourceReference: `Sheet ${sheet.sheet}`
    }))
    .filter((section) => section.text.trim().length > 0);
}

export async function parseKnowledgeFile(file: File): Promise<ParsedDocument> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileType = file.type || file.name.split(".").pop()?.toLowerCase() || "text/plain";
  const lowerName = file.name.toLowerCase();

  if (fileType.includes("pdf") || lowerName.endsWith(".pdf")) {
    return { fileType, sections: await parsePdf(buffer) };
  }

  if (
    fileType.includes("wordprocessingml") ||
    fileType.includes("msword") ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".doc")
  ) {
    return { fileType, sections: await parseDocx(buffer) };
  }

  if (fileType.includes("spreadsheet") || lowerName.endsWith(".xlsx")) {
    return { fileType, sections: await parseXlsx(buffer) };
  }

  if (fileType.includes("csv") || lowerName.endsWith(".csv")) {
    return { fileType, sections: parseCsv(buffer) };
  }

  return {
    fileType,
    sections: [
      {
        text: bufferToText(buffer),
        sourceReference: "Text file"
      }
    ]
  };
}
