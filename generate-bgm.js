// node generate-bgm.js  →  assets/bgm.wav を再生成
// スタイル: ファイナルファンタジー風タウンBGM
//   Cメジャー / BPM90 / ハープアルペジオ + ストリングスパッド + ピアノメロ + ピッツィカートベース
const fs   = require('fs');
const path = require('path');
const π2   = Math.PI * 2;
const SR   = 44100;

const BPM  = 90;
const BEAT = 60 / BPM;   // 0.6667 s
const BAR  = BEAT * 4;   // 2.6667 s
const BARS = 32;
const DUR  = BARS * BAR; // ≈ 85.3 s

// ── コード定義（Cメジャースケール）─────────────────────────
// [ルート, 3度, 5度, ルート×2] Hz
const CHD = {
  C:  [261.63, 329.63, 392.00, 523.25],  // C4 E4 G4 C5
  G:  [196.00, 246.94, 293.66, 392.00],  // G3 B3 D4 G4
  Am: [220.00, 261.63, 329.63, 440.00],  // A3 C4 E4 A4
  F:  [174.61, 220.00, 261.63, 349.23],  // F3 A3 C4 F4
  Em: [164.81, 196.00, 246.94, 329.63],  // E3 G3 B3 E4
  Dm: [146.83, 174.61, 220.00, 293.66],  // D3 F3 A3 D4
};

// 32小節コード進行（FF町BGM風）
const CHORD_SEQ = [
  'C','G','Am','F',   //  0- 3: ハープイントロ（プレリュード風）
  'C','Am','F','G',   //  4- 7: メロディーA
  'Em','Am','Dm','G', //  8-11: メロディーA 変形
  'C','G','Am','F',   // 12-15: メロディーB
  'Em','Am','Dm','G', // 16-19: メロディーB 発展
  'F','G','Am','Em',  // 20-23: ブリッジ
  'C','Am','F','G',   // 24-27: メロディーA 再現
  'Em','Am','Dm','C', // 28-31: アウトロ（ハープフェードアウト）
];

// ── メロディー定義 [Hz, 開始beat, 長さbeat] ────────────────
const E4=329.63, F4=349.23, Fs4=369.99, G4=392.00, A4=440.00,
      B4=493.88, C5=523.25, D5=587.33, E5=659.25;

const MELODY = [
  null, null, null, null,                                   //  0- 3: ハープのみ
  [[G4,0,1],[E4,1,1],[F4,2,1],[G4,3,1]],                   //  4
  [[A4,0,2],[G4,2,2]],                                      //  5
  [[C5,0,1],[B4,1,1],[A4,2,1],[G4,3,1]],                   //  6
  [[G4,0,4]],                                               //  7 （ドミナント解決感）
  [[E4,0,1],[G4,1,1],[A4,2,1],[B4,3,1]],                   //  8
  [[C5,0,2],[A4,2,2]],                                      //  9
  [[F4,0,1],[A4,1,1],[G4,2,1],[F4,3,1]],                   // 10
  [[E4,0,4]],                                               // 11
  [[C5,0,1],[B4,1,1],[C5,2,1],[D5,3,1]],                   // 12
  [[E5,0,2],[D5,2,1],[C5,3,1]],                            // 13
  [[A4,0,2],[B4,2,1],[C5,3,1]],                            // 14
  [[B4,0,2],[G4,2,2]],                                     // 15
  [[B4,0,1],[A4,1,1],[G4,2,1],[Fs4,3,1]],                 // 16: F#！UematsuのLydian魔法
  [[E4,0,2],[C5,2,2]],                                     // 17
  [[D5,0,1],[C5,1,1],[B4,2,1],[A4,3,1]],                  // 18
  [[G4,0,4]],                                              // 19
  [[F4,0,2],[A4,2,2]],                                     // 20
  [[G4,0,2],[B4,2,2]],                                     // 21
  [[A4,0,2],[C5,2,2]],                                     // 22
  [[B4,0,2],[G4,2,2]],                                     // 23
  [[G4,0,1],[E4,1,1],[F4,2,1],[G4,3,1]],                  // 24: メロA再現
  [[A4,0,2],[G4,2,2]],                                     // 25
  [[C5,0,1],[B4,1,1],[A4,2,1],[G4,3,1]],                  // 26
  [[A4,0,2],[F4,2,2]],                                     // 27: 変奏（より感情的な終止）
  null, null, null, null,                                  // 28-31: ハープのみフェード
];

// アルペジオパターン（FFプレリュード風：上昇→下降）
// インデックス: 0=ルート, 1=3度, 2=5度, 3=オクターブ
const ARP_PAT = [0, 1, 2, 3, 2, 1, 0, 1];

// ── サンプル生成 ─────────────────────────────────────────
const N   = Math.floor(SR * DUR);
const raw = new Float32Array(N);

for (let i = 0; i < N; i++) {
  const t    = i / SR;
  const bar  = Math.min(Math.floor(t / BAR), BARS - 1);
  const barT = t - bar * BAR;
  const chord = CHD[CHORD_SEQ[bar]];

  // マスターフェード（頭/末尾 各2小節）
  const master = Math.min(1, t / (BAR * 2)) * Math.min(1, (DUR - t) / (BAR * 2));

  let s = 0;

  // ── ① ハープアルペジオ（FFプレリュード風）──────────────
  const arpRate  = BEAT / 2;
  const arpFloat = barT / arpRate;
  const arpStep  = Math.floor(arpFloat) % 8;
  const arpFrac  = arpFloat - Math.floor(arpFloat);
  const arpFreq  = chord[ARP_PAT[arpStep]];
  const arpEnv   = (1 - Math.exp(-arpFrac * 70)) * Math.exp(-arpFrac * 9);
  // イントロ（0-3）とアウトロ（28-31）は主役として大きく
  const arpVol   = (bar < 4 || bar >= 28) ? 0.22 : 0.09;
  s += (
    Math.sin(π2 * arpFreq * t) * 0.82 +
    Math.sin(π2 * arpFreq * 2 * t) * 0.14 +
    Math.sin(π2 * arpFreq * 4.05 * t) * 0.03  // わずかな倍音でハープ感
  ) * arpEnv * arpVol;

  // ── ② ストリングスパッド ─────────────────────────────
  const padLFO = 0.88 + 0.12 * Math.sin(π2 * 0.13 * t);
  const PAD_AMP = [0.10, 0.13, 0.11, 0.07];
  const PAD_DET = [1.0000, 0.9985, 1.0015, 0.9993]; // わずかなデチューン
  for (let k = 0; k < chord.length; k++) {
    const f = chord[k] * PAD_DET[k];
    s += (
      Math.sin(π2 * f * t) * 1.0 +
      Math.sin(π2 * f * 2 * t) * 0.08
    ) * PAD_AMP[k] * padLFO;
  }

  // ── ③ ピッツィカートベース（ビート1・ビート3）─────────
  const beatNum  = Math.floor(barT / BEAT);
  const beatFrac = (barT / BEAT) - beatNum;
  const bassAmp  = beatNum === 0 ? 1.0 : beatNum === 2 ? 0.62 : 0.0;
  if (bassAmp > 0) {
    const bf   = chord[0] / 2; // 1オクターブ下
    const bEnv = Math.exp(-beatFrac * 9.5) * bassAmp;
    s += (
      Math.sin(π2 * bf * t) * 0.65 +
      Math.sin(π2 * bf * 2 * t) * 0.25 +
      Math.sin(π2 * bf * 3 * t) * 0.07
    ) * bEnv * 0.28;
  }

  // ── ④ ピアノ/フルートメロディー（ビブラート付き）──────
  const melPat = MELODY[bar];
  if (melPat) {
    for (const [mf, sb, db] of melPat) {
      const nt = barT - sb * BEAT;
      if (nt >= 0 && nt < db * BEAT) {
        // 音の長さに応じてサステインを調整
        const decayRate = db >= 3 ? 0.9 : db >= 2 ? 1.6 : 3.2;
        const mEnv = (1 - Math.exp(-nt * 55)) * Math.exp(-nt * decayRate);
        // 発音から50ms後にビブラートが入る（FF的なフルートっぽさ）
        const vib  = 1 + 0.005 * Math.sin(π2 * 5.8 * nt) * Math.min(1, nt * 8);
        s += (
          Math.sin(π2 * mf * vib * nt) * 0.55 +
          Math.sin(π2 * mf * 2   * nt) * 0.25 +
          Math.sin(π2 * mf * 3   * nt) * 0.12 +
          Math.sin(π2 * mf * 4.1 * nt) * 0.04  // ベル感
        ) * mEnv * 0.44;
      }
    }
  }

  raw[i] = s * master;
}

// ── 正規化 → WAV書き出し ─────────────────────────────────
let peak = 0;
for (const v of raw) if (Math.abs(v) > peak) peak = Math.abs(v);
const gain = peak > 0 ? 0.88 / peak : 1;

const wav = Buffer.alloc(44 + N * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 2, 4);
wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) {
  wav.writeInt16LE(
    Math.max(-32767, Math.min(32767, Math.round(raw[i] * gain * 32000))),
    44 + i * 2
  );
}

fs.writeFileSync(path.join(__dirname, 'assets', 'bgm.wav'), wav);
console.log(`✓ bgm.wav – ${Math.round(DUR)}秒 / BPM${BPM} / Cメジャー FF風`);
console.log('  楽器: ハープアルペジオ + ストリングスパッド + ピッツィカートベース + ピアノメロ');
console.log('  構成: ハープイントロ(4) → メロA(8) → メロB(8) → ブリッジ(4) → メロA再現(4) → アウトロ(4)');
