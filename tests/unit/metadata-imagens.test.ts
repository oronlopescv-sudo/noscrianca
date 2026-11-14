import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "@/lib/image-metadata";

/** Segmento JPEG: FF + marker + length (incl. os 2 bytes) + payload. */
function jpegSeg(marker: number, payload: Buffer): Buffer {
  const b = Buffer.alloc(4 + payload.length);
  b[0] = 0xff;
  b[1] = marker;
  b.writeUInt16BE(payload.length + 2, 2);
  payload.copy(b, 4);
  return b;
}

/** APP1 EXIF pequeno (little-endian) com orientação e uma tag "Software" ASCII. */
function app1Exif(orientation: number): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4);
  tiff.write("II", 0, "binary");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8); // IFD0: 2 entradas
  tiff.writeUInt16LE(0x0112, 10); // Orientation
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt16LE(0x0131, 22); // Software (ASCII, 4 bytes inline)
  tiff.writeUInt16LE(2, 24);
  tiff.writeUInt32LE(4, 26);
  tiff.write("test", 30, "binary");
  tiff.writeUInt32LE(0, 34); // sem próximos IFD
  return Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4, "binary");
  data.copy(b, 8);
  return b;
}

const PNG_ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("limpeza de metadados de imagens", () => {
  it("JPEG: sai o EXIF todo e fica só a orientação; JFIF e ICC ficam", () => {
    const corpo = jpegSeg(0xDA, Buffer.from([0x00, 0x0a])); // SOS + dados
    const jpg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      jpegSeg(0xE0, Buffer.from("JFIF\0\x01", "binary")), // APP0 JFIF
      jpegSeg(0xE2, Buffer.from("ICC_PROFILE\0", "binary")), // APP2 perfil de cor
      jpegSeg(0xE1, app1Exif(8)), // EXIF com orientação 8
      jpegSeg(0xEE, Buffer.from("Adobe\0", "binary")), // APP14 Adobe
      jpegSeg(0xFE, Buffer.from("comentario secreto", "binary")), // COM
      corpo,
      Buffer.from([0xff, 0xd9]),
    ]);
    const fora = stripImageMetadata(jpg, "image/jpeg");
    expect(fora).not.toEqual(jpg);
    // Percorre o resultado: APP0 e APP2 mantêm-se, EXIF é o mínimo (36 bytes),
    // Adobe e COM desapareceram, sos para o fim intacto.
    let i = 2;
    const tipos: string[] = [];
    while (fora[i] === 0xff && fora[i + 1] !== 0xDA) {
      tipos.push(fora[i + 1].toString(16));
      i += 2 + fora.readUInt16BE(i + 2);
    }
    expect(tipos).toEqual(["e0", "e2", "e1"]);
    const app1 = fora.subarray(i - 36, i); // APP1 mínimo fica colado ao SOS
    expect(app1.length).toBe(36);
    // corpo (SOS + dados + EOI) byte-a-byte
    expect(fora.subarray(fora.length - corpo.length - 2)).toEqual(Buffer.concat([corpo, Buffer.from([0xff, 0xd9])]));
  });

  it("JPEG: orientação 3 do EXIF original passa para o APP1 mínimo", () => {
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8]), jpegSeg(0xE1, app1Exif(3)), jpegSeg(0xDA, Buffer.from([0x01])), Buffer.from([0xff, 0xd9])]);
    const fora = stripImageMetadata(jpg, "image/jpeg");
    const app1 = fora.subarray(2, 2 + 2 + fora.readUInt16BE(4) - 2);
    expect(app1.toString("binary", 4, 10)).toBe("Exif\0\0");
    const ifd = 10 + 8;
    expect(app1.readUInt16LE(ifd)).toBe(1); // uma entrada só
    expect(app1.readUInt16LE(ifd + 2)).toBe(0x0112);
    expect(app1.readUInt16LE(ifd + 10)).toBe(3); // valor da orientação
  });

  it("JPEG: corpo corrupto devolve a imagem como veio (nunca parte)", () => {
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe1, 0x00])]);
    expect(stripImageMetadata(jpg, "image/jpeg")).toEqual(jpg);
  });

  it("PDF e WebP não são tocados", () => {
    const pdf = Buffer.from("%PDF-1.4 …");
    expect(stripImageMetadata(pdf, "application/pdf")).toEqual(pdf);
    const webp = Buffer.from("RIFF……WEBP");
    expect(stripImageMetadata(webp, "image/webp")).toEqual(webp);
  });

  it("PNG: eXIf/tEXt/tIME saem; IHDR/IDAT/IEND ficam", () => {
    const png = Buffer.concat([
      PNG_ASSINATURA,
      pngChunk("IHDR", Buffer.alloc(13)),
      pngChunk("eXIf", Buffer.from("gps gps gps")),
      pngChunk("tEXt", Buffer.from("Software\0Camera do tio")),
      pngChunk("tIME", Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])),
      pngChunk("IDAT", Buffer.from([0x78, 0x9c, 0x63, 0x00])),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
    const fora = stripImageMetadata(png, "image/png");
    expect(fora).not.toEqual(png);
    expect(fora.toString("binary", 1, 4)).toBe("PNG");
    // IHDR, IDAT, IEND; tEXt/eXIf desapareceram.
    let i = 8;
    const tipos: string[] = [];
    while (i < fora.length) {
      const tipo = fora.toString("binary", i + 4, i + 8);
      tipos.push(tipo);
      i += 12 + fora.readUInt32BE(i);
    }
    expect(tipos).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("PNG sem metadados sai igual (não mexe quando não há porquê)", () => {
    const png = Buffer.concat([PNG_ASSINATURA, pngChunk("IHDR", Buffer.alloc(13)), pngChunk("IDAT", Buffer.from([0x00])), pngChunk("IEND", Buffer.alloc(0))]);
    expect(stripImageMetadata(png, "image/png")).toEqual(png);
  });
});
