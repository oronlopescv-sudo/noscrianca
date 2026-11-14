/**
 * Limpeza de metadados de imagens enviadas para a plataforma (fotos de
 * crianças): corta GPS, dados da câmara, legendas, IPTC e comentários — sem
 * perder a orientação EXIF (sem ela, uma foto tirada de lado ficava deitada
 * no ecrã) nem o perfil de cor (ICC, segmento APP2). PDF e WebP não são
 * tocados. Qualquer estrutura inesperada devolve a imagem original, tal como
 * veio — a limpeza nunca pode partir um upload.
 */

const EXIF = "Exif\0\0";
const TAG_ORIENTATION = 0x0112;

/* ---- JPEG ------------------------------------------------------------ */

function jpegOrientation(app1: Buffer): number | null {
  // APP1 = "Exif\0\0" + TIFF: II/MM, magic 42, offset do IFD0.
  const tiff = app1.subarray(6);
  if (tiff.length < 8) return null;
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  const be = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!le && !be) return null;
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const n = u16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > tiff.length) return null;
    if (u16(e) !== TAG_ORIENTATION) continue;
    if (u16(e + 2) !== 3) return null; // SHORT esperado; outro tipo: não confiar
    if (u32(e + 4) !== 1) return null;
    const v = u16(e + 8);
    // Orientações reconhecidas: 1..8. Se for estranho, corta o EXIF todo.
    return v >= 1 && v <= 8 ? v : null;
  }
  return null; // sem orientação na imagem original
}

/** APP1 mínimo com apenas a tag de orientação (36 bytes: marker + len + payload). */
function app1SóOrientacao(orientation: number): Buffer {
  const b = Buffer.alloc(36);
  b[0] = 0xff;
  b[1] = 0xe1;
  b.writeUInt16BE(34, 2); // comprimento do segmento (exclui os 2 bytes de marker)
  b.write(EXIF, 4, "binary"); // 4..9
  b.write("II", 10, "binary"); // TIFF little-endian
  b.writeUInt16LE(42, 12);
  b.writeUInt32LE(8, 14); // offset do IFD0
  b.writeUInt16LE(1, 18); // IFD0: 1 entrada
  b.writeUInt16LE(TAG_ORIENTATION, 20);
  b.writeUInt16LE(3, 22); // tipo SHORT
  b.writeUInt32LE(1, 24); // count
  b.writeUInt16LE(orientation, 28);
  b.writeUInt32LE(0, 32); // sem próximos IFD
  return b;
}

function stripJpeg(data: Buffer): Buffer {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return data;
  const out: Buffer[] = [data.subarray(0, 2)];
  let exifVisto = false;
  let i = 2;
  while (i + 2 <= data.length) {
    if (data[i] !== 0xff) return data; // corpo fora do formato: devolver como veio
    const marker = data[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xda) { out.push(data.subarray(i)); break; } // SOS: resto é o corpo da imagem
    if (marker === 0xd9) { out.push(data.subarray(i)); break; } // EOI
    if (i + 4 > data.length) return data;
    const len = data.readUInt16BE(i + 2);
    const total = 4 + len - 2; // FF + marker + length + payload (o len conta a própria length)
    if (len < 2 || i + total > data.length) return data;
    if (marker >= 0xe0 && marker <= 0xef) {
      // APPn: mantém APP0 (JFIF) e APP2 (perfil de cor ICC); o EXIF sai e entra
      // apenas a orientação; XMP/IPTC/Adobe e mais APP1 descartados.
      if (marker === 0xe0 || marker === 0xe2) out.push(data.subarray(i, i + total));
      else if (marker === 0xe1 && !exifVisto && data.subarray(i + 4, i + 4 + EXIF.length).toString("binary") === EXIF) {
        const orientation = jpegOrientation(data.subarray(i + 4, i + total));
        const minimo = orientation != null ? app1SóOrientacao(orientation) : null;
        if (minimo) out.push(minimo);
        exifVisto = true;
      }
    } else if (marker !== 0xfe) {
      out.push(data.subarray(i, i + total)); // tudo o que não é COM mantém-se
    }
    // marker 0xfe (COM — comentários): descartado
    i += total;
  }
  return Buffer.concat(out);
}

/* ---- PNG ------------------------------------------------------------- */

const PNG_CORTAR = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);

function stripPng(data: Buffer): Buffer {
  if (data.length < 8 || data.toString("binary", 1, 4) !== "PNG") return data;
  const out: Buffer[] = [data.subarray(0, 8)];
  let cortou = false;
  let i = 8;
  while (i + 8 <= data.length) {
    const len = data.readUInt32BE(i);
    const total = 12 + len; // len + type + dados + crc
    if (i + total > data.length) return data;
    const type = data.toString("binary", i + 4, i + 8);
    if (PNG_CORTAR.has(type)) {
      i += total;
      cortou = true;
    } else {
      out.push(data.subarray(i, i + total));
      i += total;
      if (type === "IEND") break;
    }
  }
  return cortou ? Buffer.concat(out) : data;
}

/* ---- Entrada ---------------------------------------------------------- */

export function stripImageMetadata(data: Buffer, mime: string): Buffer {
  if (mime === "image/jpeg") return stripJpeg(data);
  if (mime === "image/png") return stripPng(data);
  return data; // WebP/PDF/… ficam como vieram
}
