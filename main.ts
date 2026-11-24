// news-image-20261124: one image summing up Tuesday 24 November 2026.
// Node 22 standard library only. No network, no randomness, no clock:
// the same input always writes the same PNG bytes.
// Draws a 1024x1024 newspaper-style front page with six verified stories.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- colours
type RGB = [number, number, number];
const NAVY: RGB = [16, 38, 63];
const PAPER: RGB = [247, 245, 239];
const INK: RGB = [24, 28, 34];
const MUTED: RGB = [84, 92, 104];
const AMBER: RGB = [242, 183, 5];
const WHITE: RGB = [255, 255, 255];
const CARD: RGB = [255, 255, 255];

// ---------------------------------------------------------------- framebuffer
const px = new Uint8Array(W * H * 3);
function fill(c: RGB): void {
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = c[0];
    px[i * 3 + 1] = c[1];
    px[i * 3 + 2] = c[2];
  }
}
function set(x: number, y: number, c: RGB): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) set(i, j, c);
  }
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) set(x, y, c);
    }
  }
}
function ring(cx: number, cy: number, r: number, t: number, c: RGB): void {
  for (let y = cy - r - t; y <= cy + r + t; y++) {
    for (let x = cx - r - t; x <= cx + r + t; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (d >= r - t && d <= r + t) set(x, y, c);
    }
  }
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, w = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let s = 0; s <= n; s++) {
    const x = Math.round(x0 + (dx * s) / n);
    const y = Math.round(y0 + (dy * s) / n);
    for (let a = 0; a < w; a++) {
      for (let b = 0; b < w; b++) set(x + a, y + b, c);
    }
  }
}
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minX = Math.min(x0, x1, x2);
  const maxX = Math.max(x0, x1, x2);
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const a = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / d;
      const b = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / d;
      const g = 1 - a - b;
      if (a >= 0 && b >= 0 && g >= 0) set(x, y, c);
    }
  }
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph is 7 rows of 5 bits, written as strings of '#' and '.'.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
};

function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}
function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] ?? FONT[" "];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "1") {
          rect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}
function wrapText(s: string, scale: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur === "" ? w : cur + " " + w;
    if (textWidth(next, scale) <= maxW) {
      cur = next;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- icons
// Each icon is drawn inside a square centred at (cx, cy) with size ~s.
function iconChip(cx: number, cy: number, s: number, accent: RGB): void {
  const h = Math.round(s * 0.52);
  rect(cx - h / 2, cy - h / 2, h, h, accent);
  rect(cx - h / 4, cy - h / 4, h / 2, h / 2, WHITE);
  disc(cx, cy, Math.round(h * 0.16), accent);
  for (let i = -1; i <= 1; i++) {
    rect(cx + i * Math.round(h * 0.36) - 3, cy - h / 2 - 12, 6, 12, accent);
    rect(cx + i * Math.round(h * 0.36) - 3, cy + h / 2, 6, 12, accent);
    rect(cx - h / 2 - 12, cy + i * Math.round(h * 0.36) - 3, 12, 6, accent);
    rect(cx + h / 2, cy + i * Math.round(h * 0.36) - 3, 12, 6, accent);
  }
  // rising chart arrow
  line(cx - 44, cy + 44, cx - 14, cy + 22, AMBER, 5);
  line(cx - 14, cy + 22, cx + 8, cy + 32, AMBER, 5);
  line(cx + 8, cy + 32, cx + 44, cy - 6, AMBER, 5);
  tri(cx + 44, cy - 6, cx + 28, cy - 4, cx + 42, cy + 10, AMBER);
}
function iconWarning(cx: number, cy: number, s: number, accent: RGB): void {
  tri(cx, cy - 52, cx - 52, cy + 40, cx + 52, cy + 40, accent);
  tri(cx, cy - 36, cx - 38, cy + 30, cx + 38, cy + 30, WHITE);
  rect(cx - 5, cy - 22, 10, 34, accent);
  disc(cx, cy + 18, 6, accent);
  // border fence lines
  line(cx - 58, cy + 52, cx + 58, cy + 52, INK, 4);
  line(cx - 58, cy + 52, cx - 58, cy + 30, INK, 4);
  line(cx + 58, cy + 52, cx + 58, cy + 30, INK, 4);
}
function iconBlast(cx: number, cy: number, s: number, accent: RGB): void {
  // building
  rect(cx - 52, cy - 6, 104, 58, [70, 84, 104]);
  for (let r = 0; r < 3; r++) {
    for (let cI = 0; cI < 5; cI++) {
      rect(cx - 44 + cI * 20, cy + 4 + r * 16, 10, 10, AMBER);
    }
  }
  // blast star above
  const spikes: [number, number][] = [
    [0, -58], [16, -40], [40, -48], [28, -24], [52, -14],
    [26, -6], [34, 18], [10, 2], [0, 26], [-12, 2],
    [-36, 16], [-26, -8], [-52, -16], [-28, -26], [-40, -50], [-16, -40],
  ];
  for (let i = 0; i < spikes.length; i++) {
    const [x1, y1] = spikes[i];
    const [x2, y2] = spikes[(i + 1) % spikes.length];
    tri(cx, cy - 20, cx + x1, cy + y1, cx + x2, cy + y2, accent);
  }
  disc(cx, cy - 20, 12, AMBER);
}
function iconFlame(cx: number, cy: number, s: number, accent: RGB): void {
  // factory
  rect(cx - 52, cy + 6, 104, 46, [70, 84, 104]);
  rect(cx - 52, cy - 22, 14, 28, [70, 84, 104]);
  rect(cx - 32, cy - 34, 14, 40, [70, 84, 104]);
  // flame
  disc(cx, cy - 8, 26, accent);
  tri(cx, cy - 52, cx - 24, cy - 6, cx + 24, cy - 6, accent);
  disc(cx, cy - 2, 13, AMBER);
  tri(cx, cy - 30, cx - 11, cy + 2, cx + 11, cy + 2, AMBER);
}
function iconShip(cx: number, cy: number, s: number, accent: RGB): void {
  // hull
  tri(cx - 54, cy - 6, cx + 54, cy - 6, cx + 40, cy + 26, accent);
  tri(cx - 54, cy - 6, cx + 40, cy + 26, cx - 40, cy + 26, accent);
  // tower
  rect(cx - 8, cy - 34, 22, 30, INK);
  rect(cx + 2, cy - 48, 4, 16, INK);
  disc(cx + 4, cy - 50, 4, [200, 40, 40]);
  // drone above
  disc(cx + 42, cy - 44, 7, [200, 40, 40]);
  line(cx + 30, cy - 44, cx + 54, cy - 44, [200, 40, 40], 3);
  line(cx + 42, cy - 56, cx + 42, cy - 32, [200, 40, 40], 3);
  // waves
  for (let i = 0; i < 3; i++) {
    line(cx - 56 + i * 4, cy + 38 + i * 10, cx + 56 - i * 4, cy + 38 + i * 10, [43, 120, 160], 4);
  }
}
function iconGlobe(cx: number, cy: number, s: number, accent: RGB): void {
  ring(cx, cy, 44, 5, accent);
  line(cx - 44, cy, cx + 44, cy, accent, 3);
  line(cx, cy - 44, cx, cy + 44, accent, 3);
  disc(cx - 24, cy - 24, 6, AMBER);
  disc(cx + 26, cy + 20, 6, AMBER);
  disc(cx + 24, cy - 26, 6, AMBER);
  disc(cx - 26, cy + 24, 6, AMBER);
  // circuit nodes around
  disc(cx - 52, cy - 6, 5, INK);
  disc(cx + 52, cy + 8, 5, INK);
  line(cx - 48, cy - 6, cx - 40, cy - 14, INK, 3);
  line(cx + 48, cy + 8, cx + 40, cy + 16, INK, 3);
}

// ---------------------------------------------------------------- stories
interface Story {
  tag: string;
  head: string;
  sub: string;
  tint: RGB;
  accent: RGB;
  icon: (cx: number, cy: number, s: number, accent: RGB) => void;
}
const STORIES: Story[] = [
  {
    tag: "TECH / BUSINESS",
    head: "NVIDIA BRINGS BACK HUANG",
    sub: "CEO reinstated after Trump push; shares jump 33%",
    tint: [230, 244, 234],
    accent: [26, 127, 55],
    icon: iconChip,
  },
  {
    tag: "EUROPE / SECURITY",
    head: "RUSSIA WARNS ESTONIA",
    sub: "Moscow: border row risks open war with NATO state",
    tint: [253, 238, 218],
    accent: [179, 64, 42],
    icon: iconWarning,
  },
  {
    tag: "WAR IN UKRAINE",
    head: "KYIV REGION STRIKES KILL 14",
    sub: "Zelensky urges US to release Patriot missiles",
    tint: [232, 238, 247],
    accent: [43, 76, 126],
    icon: iconBlast,
  },
  {
    tag: "DISASTER / ASIA",
    head: "24 DEAD IN FACTORY FIRE",
    sub: "Indonesia: search goes on for about 30 missing",
    tint: [253, 238, 227],
    accent: [194, 87, 27],
    icon: iconFlame,
  },
  {
    tag: "WAR AT SEA",
    head: "UKRAINE SINKS RUSSIAN WARSHIP",
    sub: "Drone boats hit corvette Merkury off Libya",
    tint: [226, 242, 242],
    accent: [15, 118, 110],
    icon: iconShip,
  },
  {
    tag: "GLOBAL / AI",
    head: "UN SEEKS GLOBAL AI RULES",
    sub: "Guterres: risk framework within a year",
    tint: [236, 234, 247],
    accent: [91, 74, 158],
    icon: iconGlobe,
  },
];

// ---------------------------------------------------------------- layout
function drawHeader(): void {
  rect(0, 0, W, 168, NAVY);
  rect(0, 168, W, 6, AMBER);
  drawText("THE WORLD IN ONE DAY", 40, 26, 3, AMBER);
  drawText("TUESDAY 24 NOVEMBER 2026", 40, 76, 4, WHITE);
  // small globe mark, top right
  ring(940, 84, 42, 4, AMBER);
  line(898, 84, 982, 84, AMBER, 3);
  line(940, 42, 940, 126, AMBER, 3);
  disc(922, 66, 5, WHITE);
  disc(958, 102, 5, WHITE);
}
function drawCard(st: Story, x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, CARD);
  // left icon panel
  const iw = 148;
  rect(x, y, iw, h, st.tint);
  rect(x + iw, y, 4, h, st.accent);
  st.icon(x + iw / 2, y + h / 2 + 6, 110, st.accent);
  // tag
  const tx = x + iw + 22;
  drawText(st.tag, tx, y + 22, 2, st.accent);
  // headline, wrapped, scale 3
  const maxW = w - iw - 44;
  const lines = wrapText(st.head, 3, maxW);
  let ly = y + 52;
  for (const ln of lines) {
    drawText(ln, tx, ly, 3, INK);
    ly += 26;
  }
  // sub line, wrapped, scale 2
  const subLines = wrapText(st.sub, 2, maxW);
  let sy = ly + 10;
  for (const ln of subLines) {
    drawText(ln, tx, sy, 2, MUTED);
    sy += 20;
  }
}
function drawFooter(): void {
  rect(0, 976, W, 48, NAVY);
  drawText("SIX STORIES FROM ONE DAY - AS REPORTED ON 24 NOVEMBER 2026", 40, 984, 2, WHITE);
  drawText("REUTERS - AL JAZEERA - UN NEWS", 40, 1006, 1, AMBER);
}
function build(): Buffer {
  fill(PAPER);
  drawHeader();
  const margin = 24;
  const gap = 20;
  const cw = Math.floor((W - margin * 2 - gap) / 2);
  const ch = 248;
  const top = 196;
  for (let i = 0; i < STORIES.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    drawCard(STORIES[i], margin + col * (cw + gap), top + row * (ch + gap), cw, ch);
  }
  drawFooter();
  return encodePNG();
}

// ---------------------------------------------------------------- main
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), build());
