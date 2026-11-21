// A tiny PDF writer for eval fixtures. Text only, Helvetica, one or more pages.
// Each item: { x, y, size, text, white? }. White text is invisible to a reader but still in the file (hidden-text tests).

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7e]/g, "?");

export function makePdf(pages) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const pagesId = objects.length + 1;
  objects.push(null); // placeholder for the page tree
  const kids = [];
  for (const items of pages) {
    const stream = items
      .map((it) => `${it.white ? "1 1 1 rg" : "0 0 0 rg"} BT /F1 ${it.size ?? 11} Tf ${it.x} ${it.y} Td (${esc(it.text)}) Tj ET`)
      .join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** A form in the same layout as the case forms: headings at x=45, labels at x=52, answers at x=193. */
export function makeForm(sections) {
  const pages = [[]];
  let y = 790;
  const put = (item) => {
    if (y < 70) {
      pages.push([]);
      y = 790;
    }
    pages.at(-1).push({ ...item, y });
  };
  put({ x: 45, size: 18, text: "Application Form Response" });
  y -= 30;
  for (const [heading, rows] of sections) {
    put({ x: 45, size: 13, text: heading });
    y -= 23;
    for (const [label, answer] of rows) {
      put({ x: 52, size: 10, text: label });
      if (answer) pages.at(-1).push({ x: 193, size: 12, text: answer, y: y - 1 });
      y -= 22;
    }
    y -= 10;
  }
  return makePdf(pages);
}
