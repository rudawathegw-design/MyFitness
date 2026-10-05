// ESC/POS command builder for the Xprinter XP-N200L (80 mm, 576 dots/line,
// also fine for any ESC/POS-compatible 58/80 mm printer).
const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

const TRANSLIT = { '·': '-', '•': '*', '—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '″': '"', '×': 'x', '…': '...', 'é': 'e', 'è': 'e', 'ñ': 'n', 'ü': 'u', 'ö': 'o', 'ä': 'a', 'ç': 'c', '€': 'E' };

export class Escpos {
  constructor() { this.buf = []; }
  raw(arr) { for (const b of arr) this.buf.push(b & 255); return this; }
  init() { return this.raw([ESC, 0x40, ESC, 0x74, 0x00]); } // reset + code page PC437
  align(a) { return this.raw([ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0]); }
  bold(on = true) { return this.raw([ESC, 0x45, on ? 1 : 0]); }
  size(w = 1, h = 1) { return this.raw([GS, 0x21, ((w - 1) << 4) | (h - 1)]); }
  invert(on = true) { return this.raw([GS, 0x42, on ? 1 : 0]); }
  text(s) {
    for (const ch of String(s ?? '')) {
      const c = ch.charCodeAt(0);
      if (c >= 32 && c < 127) this.buf.push(c);
      else if (c === 10) this.buf.push(LF);
      else if (TRANSLIT[ch]) for (const x of TRANSLIT[ch]) this.buf.push(x.charCodeAt(0));
      else this.buf.push(0x3f);
    }
    return this;
  }
  line(s = '') { return this.text(s).raw([LF]); }
  feed(n = 1) { return this.raw([ESC, 0x64, Math.min(255, n)]); }
  cut() { return this.raw([GS, 0x56, 0x42, 0x08]); } // feed a little, then partial cut
  drawer() { return this.raw([ESC, 0x70, 0x00, 0x19, 0xfa]); } // kick cash drawer (pin 2)
  qr(data, size = 6) {
    const bytes = Array.from(new TextEncoder().encode(String(data)));
    const len = bytes.length + 3;
    this.raw([GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00]);
    this.raw([GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, size]);
    this.raw([GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31]);
    this.raw([GS, 0x28, 0x6b, len & 255, len >> 8, 0x31, 0x50, 0x30, ...bytes]);
    this.raw([GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30]);
    return this;
  }
  /** GS v 0 raster image, sent in bands so the printer buffer never overflows. */
  raster({ bits, width, height }) {
    const wb = width >> 3;
    const BAND = 192;
    for (let y = 0; y < height; y += BAND) {
      const h = Math.min(BAND, height - y);
      this.raw([GS, 0x76, 0x30, 0x00, wb & 255, wb >> 8, h & 255, h >> 8]);
      const slice = bits.subarray(y * wb, (y + h) * wb);
      for (let i = 0; i < slice.length; i++) this.buf.push(slice[i]);
    }
    return this;
  }
  bytes() { return Uint8Array.from(this.buf); }
}

/** Canvas → 1-bit raster (black = ink). Trailing blank rows are trimmed. */
export function canvasToRaster(canvas, threshold = 150) {
  const width = canvas.width & ~7;
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, width, canvas.height);
  const wb = width >> 3;
  let height = canvas.height;
  const bits = new Uint8Array(wb * height);
  let lastInk = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] / 255;
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * a + 255 * (1 - a);
      if (lum < threshold) { bits[y * wb + (x >> 3)] |= 0x80 >> (x & 7); lastInk = y; }
    }
  }
  height = Math.min(height, lastInk + 8);
  return { bits: bits.subarray(0, wb * height), width, height };
}

export function concatBytes(parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
