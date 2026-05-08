// node generate-icon.js
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── PNG encoder ────────────────────────────────────────────
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_T[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type);
  const l = Buffer.allocUnsafe(4); l.writeUInt32BE(data.length);
  const cr = Buffer.allocUnsafe(4); cr.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([l, t, data, cr]);
}
function toPNG(w, h, px) {
  const raw = Buffer.allocUnsafe(h * (1 + w * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + w * 4)] = 0;
    px.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const hdr = Buffer.allocUnsafe(13);
  hdr.writeUInt32BE(w, 0); hdr.writeUInt32BE(h, 4);
  hdr[8] = 8; hdr[9] = 6; hdr[10] = hdr[11] = hdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', hdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Canvas ─────────────────────────────────────────────────
function canvas(W, H) {
  const buf = Buffer.alloc(W * H * 4);

  function blend(i, r, g, b, a) {
    const sa = a / 255, da = buf[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa < 1e-4) return;
    buf[i]     = ((r * sa + buf[i]     * da * (1 - sa)) / oa) | 0;
    buf[i + 1] = ((g * sa + buf[i + 1] * da * (1 - sa)) / oa) | 0;
    buf[i + 2] = ((b * sa + buf[i + 2] * da * (1 - sa)) / oa) | 0;
    buf[i + 3] = (oa * 255) | 0;
  }

  const cv = {
    set(x, y, r, g, b, a = 255) {
      x = x | 0; y = y | 0;
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      blend((y * W + x) * 4, r, g, b, a);
    },
    gradV(r1, g1, b1, r2, g2, b2) {
      for (let y = 0; y < H; y++) {
        const t = y / (H - 1);
        const r = (r1 + (r2 - r1) * t) | 0;
        const g = (g1 + (g2 - g1) * t) | 0;
        const b = (b1 + (b2 - b1) * t) | 0;
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = 255;
        }
      }
    },
    circle(cx, cy, r, R, G, B, A = 255) {
      const x0 = Math.max(0, (cx - r - 1) | 0);
      const x1 = Math.min(W - 1, (cx + r + 1) | 0);
      const y0 = Math.max(0, (cy - r - 1) | 0);
      const y1 = Math.min(H - 1, (cy + r + 1) | 0);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < r + 0.5) {
          const a = Math.min(1, r + 0.5 - d) * A / 255;
          blend((y * W + x) * 4, R, G, B, (a * 255) | 0);
        }
      }
    },
    rect(x, y, w, h, R, G, B, A = 255) {
      for (let py = Math.max(0, y); py < Math.min(H, y + h); py++)
        for (let px = Math.max(0, x); px < Math.min(W, x + w); px++)
          cv.set(px, py, R, G, B, A);
    },
    toPNG: () => {
      const raw = Buffer.allocUnsafe(H * (1 + W * 4));
      for (let y = 0; y < H; y++) {
        raw[y * (1 + W * 4)] = 0;
        buf.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
      }
      const hdr = Buffer.allocUnsafe(13);
      hdr.writeUInt32BE(W, 0); hdr.writeUInt32BE(H, 4);
      hdr[8] = 8; hdr[9] = 6; hdr[10] = hdr[11] = hdr[12] = 0;
      return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', hdr),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
        pngChunk('IEND', Buffer.alloc(0)),
      ]);
    },
  };
  return cv;
}

// ── Draw potion bottle ─────────────────────────────────────
function drawPotion(cv, W, H, cx, cy, bottleH, color, liquidFill) {
  const [R, G, B] = color;
  const bW  = (bottleH * 0.52) | 0;   // bottle body width
  const nW  = (bW * 0.38) | 0;        // neck width
  const nH  = (bottleH * 0.22) | 0;   // neck height
  const bH  = bottleH - nH;           // body height
  const br  = (bW / 2) | 0;           // body corner radius

  const bodyTop  = cy - bottleH / 2 + nH;
  const bodyBot  = cy + bottleH / 2;
  const neckTop  = cy - bottleH / 2;
  const neckBot  = bodyTop;

  const liquidTop = bodyBot - bH * liquidFill;

  // Body fill (glass tint)
  for (let py = (bodyTop) | 0; py < (bodyBot) | 0; py++) {
    const inBottom = py > bodyBot - br;
    for (let px = (cx - bW/2) | 0; px < (cx + bW/2) | 0; px++) {
      let inside = true;
      if (inBottom) {
        const lc = (cx - bW/2 + br) | 0;
        const rc = (cx + bW/2 - br) | 0;
        if (px < lc) inside = Math.hypot(px - lc, py - (bodyBot - br)) < br;
        else if (px > rc) inside = Math.hypot(px - rc, py - (bodyBot - br)) < br;
      }
      if (!inside) continue;

      if (py >= liquidTop) {
        // Liquid
        const shade = px < cx ? 1.18 : px > cx + bW * 0.2 ? 0.82 : 1.0;
        cv.set(px, py, Math.min(255, R * shade | 0), Math.min(255, G * shade | 0), Math.min(255, B * shade | 0), 230);
      } else {
        // Empty glass
        cv.set(px, py, 180, 210, 255, 28);
      }
    }
  }

  // Liquid in neck
  for (let py = (neckTop + nH * 0.5) | 0; py < (neckBot) | 0; py++) {
    for (let px = (cx - nW/2) | 0; px < (cx + nW/2) | 0; px++) {
      cv.set(px, py, R, G, B, 200);
    }
  }

  // Glass border - body
  const bw = Math.max(3, (bW * 0.055) | 0);
  for (let py = (bodyTop) | 0; py < (bodyBot) | 0; py++) {
    for (let t = 0; t < bw; t++) {
      cv.set((cx - bW/2 + t) | 0, py, 160, 200, 255, 160);
      cv.set((cx + bW/2 - t) | 0, py, 100, 140, 220, 160);
    }
  }
  // Bottom arc border
  for (let py = (bodyBot - br) | 0; py < (bodyBot + bw) | 0; py++) {
    for (let px = (cx - bW/2 - bw) | 0; px < (cx + bW/2 + bw) | 0; px++) {
      const lc = (cx - bW/2 + br) | 0, rc = (cx + bW/2 - br) | 0;
      const inner = (() => {
        if (py < bodyBot) {
          if (px < lc) return Math.hypot(px - lc, py - (bodyBot - br)) < br;
          if (px > rc) return Math.hypot(px - rc, py - (bodyBot - br)) < br;
          return px >= (cx - bW/2) && px <= (cx + bW/2);
        }
        return false;
      })();
      const lcO = (cx - bW/2 + br - bw) | 0, rcO = (cx + bW/2 - br + bw) | 0;
      const outer = (() => {
        if (px < lcO) return Math.hypot(px - (lc - bw), py - (bodyBot - br)) < br + bw;
        if (px > rcO) return Math.hypot(px - (rc + bw), py - (bodyBot - br)) < br + bw;
        return px >= (cx - bW/2 - bw) && px <= (cx + bW/2 + bw) && py <= bodyBot + bw;
      })();
      if (outer && !inner) cv.set(px, py, 130, 170, 230, 170);
    }
  }

  // Neck
  for (let py = (neckTop) | 0; py < (neckBot) | 0; py++) {
    cv.set((cx - nW/2 - 1) | 0, py, 140, 185, 240, 180);
    cv.set((cx - nW/2)     | 0, py, 140, 185, 240, 180);
    cv.set((cx + nW/2)     | 0, py, 100, 140, 210, 180);
    cv.set((cx + nW/2 + 1) | 0, py, 100, 140, 210, 180);
    // neck glass fill
    for (let px = (cx - nW/2 + 2) | 0; px < (cx + nW/2 - 1) | 0; px++)
      cv.set(px, py, 180, 210, 255, 22);
  }

  // Cork / stopper
  const corkH = (nW * 0.9) | 0;
  const corkW = (nW * 1.15) | 0;
  for (let py = (neckTop - corkH) | 0; py < (neckTop + 4) | 0; py++) {
    for (let px = (cx - corkW/2) | 0; px < (cx + corkW/2) | 0; px++) {
      const t = (py - (neckTop - corkH)) / corkH;
      cv.set(px, py, (200 - t * 30) | 0, (155 - t * 20) | 0, (100 - t * 15) | 0, 240);
    }
  }
  // Cork highlight
  cv.circle((cx - corkW * 0.15) | 0, (neckTop - corkH * 0.65) | 0, (corkW * 0.12) | 0, 255, 230, 180, 120);

  // Glass specular streak on body
  const specW = Math.max(3, (bW * 0.07) | 0);
  for (let py = (bodyTop + 10) | 0; py < (bodyBot - br) | 0; py++) {
    for (let px = (cx - bW * 0.32) | 0; px < (cx - bW * 0.32 + specW) | 0; px++)
      cv.set(px, py, 255, 255, 255, 80);
  }

  // Liquid shine
  if (liquidFill > 0.1) {
    const shineY = (liquidTop + 4) | 0;
    for (let px = (cx - bW * 0.28) | 0; px < (cx + bW * 0.1) | 0; px++)
      cv.set(px, shineY, 255, 255, 255, 90);
  }

  // Bubble sparkles in liquid
  if (liquidFill > 0.25) {
    const bub = [[cx - bW*0.18, bodyBot - bH*liquidFill*0.35, 0.06],
                 [cx + bW*0.08, bodyBot - bH*liquidFill*0.6,  0.04]];
    for (const [bx, by, br2] of bub) {
      cv.circle(bx | 0, by | 0, (bW * br2) | 0, 255, 255, 255, 70);
    }
  }
}

// ── Draw icon ──────────────────────────────────────────────
function drawIcon(W, H) {
  const cv = canvas(W, H);

  // Background gradient: deep purple-navy
  cv.gradV(18, 12, 45, 8, 5, 28);

  // Soft radial glow
  const gcx = W / 2, gcy = H * 0.48;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - gcx, y - gcy) / (W * 0.58);
    if (d < 1) cv.set(x, y, 80, 30, 160, ((1 - d) ** 2.2 * 55) | 0);
  }

  // Stars / sparkles in background
  const sparkles = [
    [W*0.12, H*0.14], [W*0.88, H*0.10], [W*0.08, H*0.55],
    [W*0.92, H*0.60], [W*0.20, H*0.82], [W*0.78, H*0.80],
    [W*0.50, H*0.08], [W*0.35, H*0.90],
  ];
  for (const [sx, sy] of sparkles) {
    cv.circle(sx | 0, sy | 0, (W * 0.012) | 0, 255, 255, 255, 160);
    cv.circle(sx | 0, sy | 0, (W * 0.004) | 0, 255, 255, 255, 255);
  }

  // Three potion bottles
  const bottleH = (H * 0.56) | 0;
  const baseY   = (H * 0.76) | 0;
  const CXS     = [W * 0.26, W * 0.50, W * 0.74].map(v => v | 0);

  const POTIONS = [
    { color: [232, 67, 147],  fill: 0.72 },  // pink/magenta
    { color: [100, 200, 255], fill: 0.55 },  // cyan/blue
    { color: [255, 180, 30],  fill: 0.85 },  // golden yellow
  ];

  for (let i = 0; i < 3; i++) {
    const cx = CXS[i];
    const cy = (baseY - bottleH / 2) | 0;
    drawPotion(cv, W, H, cx, cy, bottleH, POTIONS[i].color, POTIONS[i].fill);
  }

  // Magical sparkles around bottles
  const magicSparkles = [
    [W*0.18, H*0.35, 8], [W*0.82, H*0.38, 7],
    [W*0.42, H*0.22, 6], [W*0.62, H*0.25, 9],
    [W*0.30, H*0.58, 5], [W*0.72, H*0.55, 6],
  ];
  for (const [sx, sy, sr] of magicSparkles) {
    cv.circle(sx | 0, sy | 0, sr, 255, 220, 100, 200);
    cv.circle(sx | 0, sy | 0, (sr * 0.4) | 0, 255, 255, 255, 255);
  }

  return cv.toPNG();
}

// ── Generate ───────────────────────────────────────────────
const OUT = path.join(__dirname, 'assets');
const icon = drawIcon(1024, 1024);
fs.writeFileSync(path.join(OUT, 'icon.png'), icon);
fs.writeFileSync(path.join(OUT, 'adaptive-icon.png'), icon);
fs.writeFileSync(path.join(OUT, 'splash-icon.png'), drawIcon(512, 512));
console.log('✓ icon.png / adaptive-icon.png (1024×1024)');
console.log('✓ splash-icon.png (512×512)');
