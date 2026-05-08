// node generate-background.js
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const W = 600, H = 1100;
const buf = Buffer.alloc(W * H * 4);

function idx(x, y) { return (((y | 0) * W + (x | 0)) * 4); }

function blend(x, y, r, g, b, a) {
  x = x | 0; y = y | 0;
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = idx(x, y);
  const sa = a / 255, da = buf[i+3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa < 1e-5) return;
  buf[i]   = ((r * sa + buf[i]   * da * (1 - sa)) / oa) | 0;
  buf[i+1] = ((g * sa + buf[i+1] * da * (1 - sa)) / oa) | 0;
  buf[i+2] = ((b * sa + buf[i+2] * da * (1 - sa)) / oa) | 0;
  buf[i+3] = (oa * 255) | 0;
}

function circle(cx, cy, r, R, G, B, A) {
  for (let y = Math.max(0, (cy-r-1)|0); y <= Math.min(H-1, (cy+r+1)|0); y++)
    for (let x = Math.max(0, (cx-r-1)|0); x <= Math.min(W-1, (cx+r+1)|0); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r + 0.5) blend(x, y, R, G, B, (Math.min(1, r+0.5-d) * A) | 0);
    }
}

function rect(x, y, w, h, R, G, B, A) {
  for (let py = Math.max(0,y|0); py < Math.min(H,(y+h)|0); py++)
    for (let px = Math.max(0,x|0); px < Math.min(W,(x+w)|0); px++)
      blend(px, py, R, G, B, A);
}

// ── 1. Sky gradient (deep midnight purple → dark indigo) ──
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  const r = (6  + t * 10) | 0;
  const g = (3  + t * 6)  | 0;
  const b = (18 + t * 25) | 0;
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = 255;
  }
}

// ── 2. Nebula clouds ──────────────────────────────────────
const nebs = [
  { cx: W*0.25, cy: H*0.18, rx: 180, ry: 100, r:60, g:20, b:120 },
  { cx: W*0.80, cy: H*0.12, rx: 140, ry:  80, r:20, g:30, b:100 },
  { cx: W*0.55, cy: H*0.35, rx: 200, ry: 120, r:40, g:10, b: 90 },
  { cx: W*0.10, cy: H*0.45, rx: 120, ry:  80, r:80, g:15, b:110 },
];
for (const { cx, cy, rx, ry, r, g, b } of nebs) {
  for (let y = Math.max(0,(cy-ry)|0); y < Math.min(H,(cy+ry)|0); y++) {
    for (let x = Math.max(0,(cx-rx)|0); x < Math.min(W,(cx+rx)|0); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < 1) blend(x, y, r, g, b, ((1 - d)**2.5 * 55) | 0);
    }
  }
}

// ── 3. Stars ──────────────────────────────────────────────
// Deterministic star positions using LCG
let seed = 42;
const lcg = () => { seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF; return (seed >>> 0) / 4294967296; };
for (let i = 0; i < 320; i++) {
  const sx = (lcg() * W) | 0;
  const sy = (lcg() * H * 0.72) | 0;
  const bright = (lcg() * 200 + 55) | 0;
  const size   = lcg() < 0.08 ? 2 : 1;
  circle(sx, sy, size, bright, bright, Math.min(255, bright + 40), bright);
}

// ── 4. Moon ───────────────────────────────────────────────
const moonX = W * 0.72, moonY = H * 0.13, moonR = W * 0.11;
// Outer glow
for (let pass = 5; pass >= 1; pass--)
  circle(moonX | 0, moonY | 0, (moonR + pass * 14) | 0, 140, 120, 255, (18 - pass * 2) | 0);
// Moon body
circle(moonX | 0, moonY | 0, moonR | 0, 200, 195, 255, 255);
circle(moonX | 0, moonY | 0, (moonR * 0.85) | 0, 220, 215, 255, 255);
// Moon craters / highlight
circle((moonX + moonR*0.25) | 0, (moonY - moonR*0.20) | 0, (moonR*0.15)|0, 240,238,255,180);
circle((moonX - moonR*0.30) | 0, (moonY + moonR*0.25) | 0, (moonR*0.09)|0, 180,175,240, 90);

// ── 5. Aurora bands ──────────────────────────────────────
const auroras = [
  { y: H*0.22, amp: 22, freq: 0.008, r:50,  g:180, b:255, a:18 },
  { y: H*0.28, amp: 18, freq: 0.011, r:120, g: 60, b:255, a:15 },
  { y: H*0.32, amp: 25, freq: 0.007, r:60,  g:220, b:180, a:12 },
];
for (const { y, amp, freq, r, g, b, a } of auroras) {
  for (let x = 0; x < W; x++) {
    const wave = Math.sin(x * freq) * amp;
    for (let dy = -18; dy <= 18; dy++) {
      const py = (y + wave + dy) | 0;
      const fade = 1 - Math.abs(dy) / 18;
      blend(x, py, r, g, b, (a * fade * fade) | 0);
    }
  }
}

// ── 6. Distant mountains ─────────────────────────────────
for (let x = 0; x < W; x++) {
  const m1 = H * 0.60 + Math.sin(x * 0.018) * 60 + Math.sin(x * 0.042) * 28;
  const m2 = H * 0.65 + Math.sin(x * 0.013 + 1) * 50 + Math.sin(x * 0.035) * 20;
  for (let y = (m2) | 0; y < H; y++) blend(x, y, 20, 12, 45, 255);
  for (let y = (m1) | 0; y < (m2) | 0; y++) blend(x, y, 28, 16, 55, 255);
}

// ── 7. Crystal formations at bottom ──────────────────────
function crystal(cx, baseY, width, height, R, G, B) {
  const tip = baseY - height;
  for (let y = tip; y <= baseY; y++) {
    const t = (y - tip) / height;
    const hw = (width / 2 * t) | 0;
    for (let x = (cx - hw); x <= (cx + hw); x++) {
      const edgeDist = Math.min(x - (cx-hw), (cx+hw) - x);
      const shade = edgeDist < 4 ? 0.6 : x < cx ? 1.2 : 0.8;
      blend(x, y, Math.min(255, R*shade)|0, Math.min(255, G*shade)|0, Math.min(255, B*shade)|0, 210);
    }
    // Specular edge
    blend((cx - hw) | 0, y, 200, 220, 255, 120);
    blend((cx - hw + 1) | 0, y, 180, 200, 255, 60);
  }
  // Crystal tip glow
  circle(cx | 0, tip | 0, 4, R, G, 255, 180);
  circle(cx | 0, tip | 0, 2, 255, 255, 255, 220);
}

const crystalDefs = [
  { cx: W*0.05, h: H*0.18, w: 28, r: 80,  g:40,  b:180 },
  { cx: W*0.13, h: H*0.24, w: 38, r: 60,  g:20,  b:200 },
  { cx: W*0.20, h: H*0.14, w: 22, r:100,  g:50,  b:220 },
  { cx: W*0.82, h: H*0.22, w: 35, r: 40,  g:80,  b:190 },
  { cx: W*0.90, h: H*0.17, w: 26, r: 70,  g:30,  b:210 },
  { cx: W*0.96, h: H*0.12, w: 20, r: 90,  g:60,  b:200 },
  { cx: W*0.45, h: H*0.10, w: 18, r:120,  g:40,  b:220 },
  { cx: W*0.55, h: H*0.13, w: 24, r: 80,  g:20,  b:200 },
];
for (const { cx, h, w, r, g, b } of crystalDefs)
  crystal(cx | 0, H - 1, w, h * 0.9, r, g, b);

// ── 8. Mist / fog at ground ───────────────────────────────
for (let y = H - 1; y >= H * 0.72; y--) {
  const t = (y - H*0.72) / (H * 0.28);
  const a = (t ** 1.8 * 160) | 0;
  for (let x = 0; x < W; x++) blend(x, y, 40, 20, 80, a);
}

// ── 9. Floating magical orbs ─────────────────────────────
const orbs = [
  { x:W*0.18, y:H*0.50, r:12, R:255, G:180, B:80  },
  { x:W*0.82, y:H*0.44, r:10, R:180, G:80,  B:255 },
  { x:W*0.35, y:H*0.62, r: 8, R:80,  G:220, B:255 },
  { x:W*0.68, y:H*0.57, r: 9, R:255, G:100, B:180 },
  { x:W*0.50, y:H*0.48, r:14, R:200, G:255, B:180 },
];
for (const { x, y, r, R, G, B } of orbs) {
  circle(x|0, y|0, r*3,   R, G, B, 18);
  circle(x|0, y|0, r*1.8, R, G, B, 40);
  circle(x|0, y|0, r,     R, G, B, 200);
  circle(x|0, y|0, (r*0.4)|0, 255, 255, 255, 220);
}

// ── 10. Gold decorative border lines ─────────────────────
const gold = (a) => { rect(0, 0, W, 4, 200, 160, 60, a); rect(0, H-4, W, 4, 200, 160, 60, a); };
gold(180);
rect(0, 6, W, 2, 200, 160, 60, 90);
rect(0, H-8, W, 2, 200, 160, 60, 90);
// Corner ornaments
for (const [cx, cy] of [[18,18],[W-18,18],[18,H-18],[W-18,H-18]]) {
  circle(cx, cy, 8, 200, 160, 60, 200);
  circle(cx, cy, 4, 240, 200, 100, 255);
  circle(cx, cy, 2, 255, 240, 180, 255);
}

// ── PNG encode ────────────────────────────────────────────
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c>>>1) : c>>>1;
    t[n] = c;
  }
  return t;
})();
function crc32(b) { let c=0xFFFFFFFF; for (const x of b) c=CRC_T[(c^x)&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function chunk(type, data) {
  const t=Buffer.from(type), l=Buffer.allocUnsafe(4), cr=Buffer.allocUnsafe(4);
  l.writeUInt32BE(data.length); cr.writeUInt32BE(crc32(Buffer.concat([t,data])));
  return Buffer.concat([l,t,data,cr]);
}
const raw = Buffer.allocUnsafe(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y*(1+W*4)] = 0;
  buf.copy(raw, y*(1+W*4)+1, y*W*4, (y+1)*W*4);
}
const hdr = Buffer.allocUnsafe(13);
hdr.writeUInt32BE(W,0); hdr.writeUInt32BE(H,4);
hdr[8]=8; hdr[9]=6; hdr[10]=hdr[11]=hdr[12]=0;
const png = Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR', hdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.mkdirSync(path.join(__dirname,'assets'), { recursive: true });
fs.writeFileSync(path.join(__dirname,'assets','background.png'), png);
console.log(`✓ background.png  ${W}×${H}px  (FF potion theme)`);
