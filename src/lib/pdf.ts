import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type DocPdf = {
  kind: string;            // "RECIBO", "FATURA"
  number: string;
  issuer: { name: string; lines: string[] };
  recipient: { title: string; lines: string[] };
  meta: [string, string][];
  items: { description: string; amount: string }[];
  totals: [string, string][];
  note?: string;
  stamp?: string;          // "PAGO", "ANULADO"
  accent?: string;         // hex
  footer?: string;
};

const INK = rgb(0.07, 0.09, 0.15);
const SOFT = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.9, 0.91, 0.92);

function hexToRgb(hex?: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : rgb(0.94, 0.44, 0.31);
}

/** As fontes standard só suportam WinAnsi: substitui caracteres fora desse conjunto. */
const EXTRA = new Set([0x20ac, 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022]);
function safe(s: string): string {
  let out = "";
  for (const ch of s ?? "") {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13 || code === 0x2028 || code === 0x2029) out += " ";
    else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || EXTRA.has(code)) out += ch;
    else out += "?";
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of (text ?? "").split(/\r?\n/)) {
    let line = "";
    for (const word of safe(para).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function buildDocPdf(d: DocPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.kind} ${d.number}`);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(d.accent);
  const W = 595.28, H = 841.89, M = 48;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const text = (s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(safe(s), { x, y: yy, size: o.size ?? 10, font: o.f ?? font, color: o.color ?? INK });
  const right = (s: string, xRight: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => {
    const f = o.f ?? font, size = o.size ?? 10;
    text(s, xRight - f.widthOfTextAtSize(safe(s), size), yy, o);
  };

  page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: accent });
  text(d.issuer.name, M, y - 10, { size: 16, f: bold });
  right(d.kind, W - M, y - 8, { size: 18, f: bold, color: accent });
  right(`N.º ${d.number}`, W - M, y - 26, { size: 11, f: bold });
  y -= 30;
  for (const l of d.issuer.lines.filter(Boolean).flatMap((l) => wrap(l, font, 9, 280))) {
    text(l, M, y, { size: 9, color: SOFT });
    y -= 12;
  }
  y -= 14;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });
  y -= 22;

  const topY = y;
  text(d.recipient.title.toUpperCase(), M, y, { size: 8, f: bold, color: SOFT });
  y -= 14;
  for (const l of d.recipient.lines.filter(Boolean).flatMap((l) => wrap(l, font, 10, 260))) {
    text(l, M, y);
    y -= 13;
  }
  let my = topY;
  for (const [k, v] of d.meta) {
    text(k, 340, my, { size: 9, color: SOFT });
    right(v, W - M, my, { size: 10, f: bold });
    my -= 15;
  }
  y = Math.min(y, my) - 16;

  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: rgb(0.965, 0.969, 0.976) });
  text("DESCRIÇÃO", M + 8, y, { size: 8, f: bold, color: SOFT });
  right("VALOR", W - M - 8, y, { size: 8, f: bold, color: SOFT });
  y -= 24;
  for (const item of d.items) {
    const lines = wrap(item.description, font, 10, W - 2 * M - 130);
    if (y - lines.length * 13 < 140) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
    right(item.amount, W - M - 8, y);
    for (const l of lines) {
      text(l, M + 8, y);
      y -= 13;
    }
    y -= 5;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.5, color: LINE });
    y -= 8;
  }
  y -= 6;
  d.totals.forEach(([k, v], i) => {
    const last = i === d.totals.length - 1;
    text(k, 340, y, { size: last ? 11 : 10, f: last ? bold : font, color: last ? INK : SOFT });
    right(v, W - M - 8, y, { size: last ? 13 : 10, f: bold });
    y -= last ? 22 : 16;
  });

  if (d.stamp) {
    const size = 30;
    const w = bold.widthOfTextAtSize(d.stamp, size);
    const color = d.stamp === "ANULADO" ? rgb(0.86, 0.15, 0.15) : rgb(0.06, 0.6, 0.4);
    page.drawRectangle({ x: M, y: y - 8, width: w + 24, height: size + 14, borderColor: color, borderWidth: 2, opacity: 0, borderOpacity: 0.8 });
    page.drawText(d.stamp, { x: M + 12, y: y + 2, size, font: bold, color, opacity: 0.8 });
    y -= size + 30;
  }
  if (d.note) {
    y -= 6;
    for (const l of wrap(d.note, font, 9, W - 2 * M)) {
      if (y < 70) break;
      text(l, M, y, { size: 9, color: SOFT });
      y -= 12;
    }
  }
  if (d.footer) {
    page.drawLine({ start: { x: M, y: 52 }, end: { x: W - M, y: 52 }, thickness: 0.5, color: LINE });
    text(d.footer, M, 38, { size: 8, color: SOFT });
  }
  return pdf.save();
}

export function pdfResponse(bytes: Uint8Array, fileName: string): Response {
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
