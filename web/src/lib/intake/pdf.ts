// Reads text out of a PDF with page numbers and positions. Code only, no AI.
import { getDocumentProxy } from "unpdf";
import { joinLine, type TextItem } from "./form";

export class UnreadablePdf extends Error {}

export async function pdfItems(bytes: Uint8Array): Promise<{ pages: number; items: TextItem[] }> {
  let pdf;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch {
    throw new UnreadablePdf("The file could not be opened as a PDF");
  }
  const items: TextItem[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      items.push({ page: p, x: it.transform[4], y: it.transform[5], h: it.height, w: it.width, str: it.str });
    }
  }
  return { pages: pdf.numPages, items };
}

export type DeckPage = { page: number; text: string };

/** The deck as page-numbered text, so every claim can cite "Deck, page 4". */
export function deckPages(items: TextItem[], pages: number): DeckPage[] {
  const out: DeckPage[] = [];
  for (let p = 1; p <= pages; p++) {
    const onPage = items.filter((i) => i.page === p);
    const lines: TextItem[][] = [];
    for (const it of [...onPage].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const line = lines.find((l) => Math.abs(l[0].y - it.y) <= 2);
      if (line) line.push(it);
      else lines.push([it]);
    }
    out.push({ page: p, text: lines.map(joinLine).join("\n") });
  }
  return out;
}

/** A scanned deck has pages but almost no text. */
export function looksScanned(pages: DeckPage[]): boolean {
  const chars = pages.reduce((s, p) => s + p.text.replace(/\s/g, "").length, 0);
  return pages.length > 0 && chars < 40 * pages.length;
}
