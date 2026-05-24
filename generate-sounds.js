// node generate-sounds.js
const fs  = require('fs');
const path = require('path');

const π2 = Math.PI * 2;

function makeWav(getSample, dur, sr = 44100) {
  const n   = Math.floor(sr * dur);
  const buf = Buffer.alloc(44 + n * 2);

  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);

  let peak = 0;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    raw[i] = getSample(i / sr, dur);
    if (Math.abs(raw[i]) > peak) peak = Math.abs(raw[i]);
  }
  const gain = peak > 0 ? 0.92 / peak : 1;
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(raw[i] * gain * 32000))), 44 + i * 2);
  }
  return buf;
}

// ── Select: 明るいポップ（ピッチスイープ＋倍音）──────────
const selectWav = makeWav((t) => {
  const attack = 1 - Math.exp(-t * 800);
  const decay  = Math.exp(-t * 35);
  const env    = attack * decay;
  const f      = 1050 * Math.exp(-t * 18);   // ピッチが素早く落ちる
  return (
    Math.sin(π2 * f * t)       * 0.65 +
    Math.sin(π2 * f * 2 * t)   * 0.22 +
    Math.sin(π2 * f * 3 * t)   * 0.10 +
    Math.sin(π2 * f * 0.5 * t) * 0.08
  ) * env;
}, 0.12);

// ── Move: 液体ドロップ（低音ピッチ落下＋ノイズ混合）──────
const moveWav = makeWav((t) => {
  const attack = 1 - Math.exp(-t * 600);
  const decay  = Math.exp(-t * 22);
  const env    = attack * decay;
  const f      = 520 * Math.exp(-t * 25);    // 深くピッチが落ちる
  const noise  = (Math.random() * 2 - 1) * 0.07 * Math.exp(-t * 30);
  return (
    Math.sin(π2 * f * t)       * 0.58 +
    Math.sin(π2 * f * 1.5 * t) * 0.22 +
    Math.sin(π2 * f * 0.5 * t) * 0.18 +
    noise
  ) * env;
}, 0.20);

// ── Error: 重めの低音バウンス ────────────────────────────
const errorWav = makeWav((t) => {
  const attack = 1 - Math.exp(-t * 300);
  const decay  = Math.exp(-t * 11);
  const env    = attack * decay;
  const noise  = (Math.random() * 2 - 1) * 0.10 * Math.exp(-t * 20);
  // 少し音程が下がる不協和な感じ
  return (
    Math.sin(π2 * 140 * t) * 0.55 +
    Math.sin(π2 *  70 * t) * 0.28 +
    Math.sin(π2 * 210 * t) * 0.12 +
    Math.sin(π2 * 185 * t) * 0.10 +  // 不協和部分
    noise
  ) * env;
}, 0.26);

// ── Win: Cメジャーアルペジオ（C5-E5-G5-C6）ベル風 ───────
const WIN_NOTES = [
  { freq: 523.25, delay: 0.00, amp: 1.00 },  // C5
  { freq: 659.25, delay: 0.13, amp: 0.95 },  // E5
  { freq: 783.99, delay: 0.26, amp: 0.95 },  // G5
  { freq: 1046.5, delay: 0.39, amp: 1.10 },  // C6
];

const winWav = makeWav((t) => {
  let s = 0;
  for (const { freq, delay, amp } of WIN_NOTES) {
    const lt = t - delay;
    if (lt < 0) continue;
    // ベルらしい：速いアタック＋ゆっくり減衰＋わずかな非整数倍音
    const env = (1 - Math.exp(-lt * 400)) * Math.exp(-lt * 3.5);
    s += (
      Math.sin(π2 * freq       * lt) * 0.60 +
      Math.sin(π2 * freq * 2   * lt) * 0.22 +
      Math.sin(π2 * freq * 3   * lt) * 0.10 +
      Math.sin(π2 * freq * 4.2 * lt) * 0.05 +  // 非整数倍音でベル感
      Math.sin(π2 * freq * 0.5 * lt) * 0.08
    ) * env * amp;
  }
  return s / WIN_NOTES.length;
}, 1.10);

// ── Complete: チューブ完成ベル（Cペンタトニック昇順 × 8音）─
// C5 D5 E5 G5 A5 C6 D6 E6 — 1本完成するたびに1音ずつ上がる
const COMPLETE_FREQS = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.5, 1174.7, 1318.5, 1568.0];

function makeBell(freq) {
  return makeWav((t) => {
    const env = (1 - Math.exp(-t * 600)) * Math.exp(-t * 7);
    return (
      Math.sin(π2 * freq       * t) * 0.58 +
      Math.sin(π2 * freq * 2   * t) * 0.24 +
      Math.sin(π2 * freq * 3   * t) * 0.10 +
      Math.sin(π2 * freq * 4.1 * t) * 0.05 +  // わずかな非整数倍音でベル感
      Math.sin(π2 * freq * 0.5 * t) * 0.06
    ) * env;
  }, 0.45);
}

// ── 書き出し ────────────────────────────────────────────
const dir = path.join(__dirname, 'assets', 'sounds');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'select.wav'), selectWav);
console.log('✓ select.wav  – 明るいポップ');
fs.writeFileSync(path.join(dir, 'move.wav'),   moveWav);
console.log('✓ move.wav    – 液体ドロップ');
fs.writeFileSync(path.join(dir, 'error.wav'),  errorWav);
console.log('✓ error.wav   – 重い低音');
fs.writeFileSync(path.join(dir, 'win.wav'),    winWav);
console.log('✓ win.wav     – Cメジャーアルペジオ');
COMPLETE_FREQS.forEach((freq, i) => {
  fs.writeFileSync(path.join(dir, `complete${i + 1}.wav`), makeBell(freq));
  console.log(`✓ complete${i + 1}.wav – ${['C5','D5','E5','G5','A5','C6','D6','E6','G6'][i]}`);
});
console.log('Done!');
