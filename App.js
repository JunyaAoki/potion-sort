import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Dimensions, SafeAreaView, StatusBar, Animated, Easing, Modal,
  ImageBackground,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { initSounds, playSound } from './sounds';

const { width: SW, height: SH } = Dimensions.get('window');

// ── Palette ────────────────────────────────────────────────
const PALETTE = [
  '#E84343','#2F7BF0','#27C757','#F57C00',
  '#8B30E8','#F0C800','#E8509A','#18B8C8',
  '#8B5E3C','#4A5AAD',
];
const BG   = '#F0F2F8';
const DARK = '#1A1E2E';
const GREY = '#888FA8';

// ── Stage Config（5ステージごとに難易度アップ）─────────────
const TIERS = [
  { colors: 4, cap: 4, empty: 2 },  // 1-5
  { colors: 5, cap: 4, empty: 2 },  // 6-10
  { colors: 6, cap: 4, empty: 2 },  // 11-15
  { colors: 7, cap: 4, empty: 2 },  // 16-20
  { colors: 7, cap: 5, empty: 2 },  // 21-25
  { colors: 8, cap: 5, empty: 2 },  // 26-30
  { colors: 8, cap: 5, empty: 1 },  // 31-35
  { colors: 9, cap: 5, empty: 1 },  // 36-40
  { colors: 9, cap: 5, empty: 1 },  // 41-45
  { colors: 10, cap: 5, empty: 1 }, // 46+
];

const BANDS = [
  { name: 'EASY',   color: '#27C757', start: 1,  end: 10 },
  { name: 'NORMAL', color: '#2F7BF0', start: 11, end: 20 },
  { name: 'HARD',   color: '#F57C00', start: 21, end: 30 },
  { name: 'EXPERT', color: '#E84343', start: 31, end: 40 },
  { name: 'MASTER', color: '#8B30E8', start: 41, end: 50 },
];

function getStageConfig(stageNum) {
  const idx   = Math.min(Math.floor((stageNum - 1) / 5), TIERS.length - 1);
  const band  = BANDS[Math.min(Math.floor((stageNum - 1) / 10), BANDS.length - 1)];
  return { ...TIERS[idx], stageColor: band.color, bandName: band.name };
}

const INITIAL_ITEMS = { undo: 5, hint: 5 };
const ITEMS_KEY     = 'ballsort_items_v1';
const PROGRESS_KEY  = 'ballsort_progress_v2';

// ── Seeded PRNG (mulberry32) ───────────────────────────────
function seededRand(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Level Generator ────────────────────────────────────────
function makeLevel(numColors, cap, numEmpty, seed) {
  const rand = seededRand(seed);

  const balls = [];
  for (let c = 0; c < numColors; c++)
    for (let i = 0; i < cap; i++) balls.push(c);

  for (let i = balls.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [balls[i], balls[j]] = [balls[j], balls[i]];
  }

  const tubes = [];
  for (let i = 0; i < numColors; i++)
    tubes.push(balls.slice(i * cap, (i + 1) * cap));
  for (let i = 0; i < numEmpty; i++) tubes.push([]);

  for (let i = tubes.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [tubes[i], tubes[j]] = [tubes[j], tubes[i]];
  }
  return tubes;
}

// ── Tube ───────────────────────────────────────────────────
function Tube({ balls, cap, selected, tubeW, tubeH, stageColor,
                isDraining, drainCnt, drainAnim,
                isFilling,  fillCnt,  fillColorIdx, fillAnim }) {
  const br   = tubeW / 2;
  const segH = tubeH / cap;
  const bw   = selected ? 2.5 : 1.5;
  const spec = Math.max(3, tubeW * 0.075);

  // Draining balls are hidden from normal render; replaced by animated overlay
  const visibleBalls = (isDraining && drainCnt > 0)
    ? balls.slice(0, balls.length - drainCnt)
    : balls;
  const drainColor = (isDraining && drainCnt > 0 && balls.length > 0)
    ? PALETTE[balls[balls.length - 1]]
    : null;

  return (
    <View style={{ alignItems: 'center' }}>

      {/* ── 3D Rim — shows the depth of the tube opening ── */}
      <View style={{
        width: tubeW + 6, height: 13,
        backgroundColor: selected ? stageColor : '#8895C2',
        borderTopLeftRadius: 7, borderTopRightRadius: 7,
        overflow: 'hidden',
      }}>
        {/* Left specular on rim */}
        <View style={{
          position: 'absolute', left: 4, top: 2,
          width: '42%', height: 5,
          backgroundColor: 'rgba(255,255,255,0.58)',
          borderRadius: 3,
        }} />
        {/* Dark inner hole — depth illusion */}
        <View style={{
          position: 'absolute', left: 5, right: 5, top: 7, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.42)',
          borderTopLeftRadius: 3, borderTopRightRadius: 3,
        }} />
      </View>

      {/* ── Outer shadow (separate from overflow container) ── */}
      <View style={{
        borderBottomLeftRadius: br, borderBottomRightRadius: br,
        shadowColor: selected ? stageColor : '#1A2890',
        shadowOffset: { width: 2, height: selected ? 14 : 6 },
        shadowOpacity: selected ? 0.58 : 0.18,
        shadowRadius: selected ? 18 : 10,
        elevation: selected ? 14 : 3,
      }}>

        {/* ── Glass tube body ── */}
        <View style={{
          width: tubeW, height: tubeH,
          backgroundColor: 'rgba(205,220,255,0.10)',
          borderBottomLeftRadius: br, borderBottomRightRadius: br,
          borderTopLeftRadius: 2, borderTopRightRadius: 2,
          borderLeftWidth:   bw,
          borderRightWidth:  bw + 0.5,
          borderBottomWidth: bw,
          borderTopWidth: 0,
          // Asymmetric border colors → cylinder illusion
          borderLeftColor:   selected ? stageColor : 'rgba(190,210,255,0.92)',
          borderRightColor:  selected ? stageColor : 'rgba(65,85,155,0.88)',
          borderBottomColor: selected ? stageColor : 'rgba(105,125,180,0.88)',
          overflow: 'hidden',
        }}>

          {/* ── Liquid segments (static, non-draining balls only) ── */}
          {visibleBalls.map((colorIdx, i) => {
            const isTop = i === visibleBalls.length - 1 && !isDraining;
            return (
              <View key={i} style={{
                position: 'absolute',
                bottom: segH * i, left: 0, right: 0,
                height: segH + (i === 0 ? br * 0.85 : 0),
                backgroundColor: PALETTE[colorIdx],
                borderTopLeftRadius:  isTop ? 8 : 0,
                borderTopRightRadius: isTop ? 8 : 0,
                overflow: 'hidden',
              }}>
                {/* Left sheen — wide soft highlight */}
                <View style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: '40%',
                  backgroundColor: 'rgba(255,255,255,0.18)',
                }} />
                {/* Narrow specular line on liquid */}
                <View style={{
                  position: 'absolute', left: '11%', top: 0, bottom: 0,
                  width: Math.max(2, tubeW * 0.055),
                  backgroundColor: 'rgba(255,255,255,0.40)',
                }} />
                {/* Right shadow — opposite light side */}
                <View style={{
                  position: 'absolute', right: 0, top: 0, bottom: 0,
                  width: '28%',
                  backgroundColor: 'rgba(0,0,0,0.22)',
                }} />
              </View>
            );
          })}

          {/* ── Drain overlay: draining balls shrink from top (bottom-anchored) ── */}
          {isDraining && drainCnt > 0 && drainColor && drainAnim && (
            <Animated.View style={{
              position: 'absolute',
              bottom: segH * visibleBalls.length,
              left: 0, right: 0,
              height: segH * drainCnt,
              backgroundColor: drainColor,
              transform: [
                { translateY: drainAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, (segH * drainCnt) / 2],
                  }) },
                { scaleY: drainAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0],
                  }) },
              ],
            }}>
              <View style={{ position:'absolute', left:0, top:0, bottom:0, width:'40%', backgroundColor:'rgba(255,255,255,0.18)' }} />
              <View style={{ position:'absolute', left:'11%', top:0, bottom:0, width: Math.max(2,tubeW*0.055), backgroundColor:'rgba(255,255,255,0.40)' }} />
              <View style={{ position:'absolute', right:0, top:0, bottom:0, width:'28%', backgroundColor:'rgba(0,0,0,0.22)' }} />
            </Animated.View>
          )}

          {/* ── Fill overlay: new balls grow upward from bottom (bottom-anchored) ── */}
          {isFilling && fillCnt > 0 && fillAnim && (
            <Animated.View style={{
              position: 'absolute',
              bottom: segH * balls.length,
              left: 0, right: 0,
              height: segH * fillCnt,
              backgroundColor: PALETTE[fillColorIdx],
              borderTopLeftRadius: 8, borderTopRightRadius: 8,
              transform: [
                { translateY: fillAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [(segH * fillCnt) / 2, 0],
                  }) },
                { scaleY: fillAnim },
              ],
            }}>
              <View style={{ position:'absolute', left:0, top:0, bottom:0, width:'40%', backgroundColor:'rgba(255,255,255,0.18)' }} />
              <View style={{ position:'absolute', left:'11%', top:0, bottom:0, width: Math.max(2,tubeW*0.055), backgroundColor:'rgba(255,255,255,0.40)' }} />
              <View style={{ position:'absolute', right:0, top:0, bottom:0, width:'28%', backgroundColor:'rgba(0,0,0,0.22)' }} />
            </Animated.View>
          )}

          {/* Meniscus curve on top of visible liquid */}
          {visibleBalls.length > 0 && !isDraining && !isFilling && (
            <View style={{
              position: 'absolute',
              bottom: segH * visibleBalls.length - segH * 0.19,
              left: 0, right: 0, height: segH * 0.19,
              backgroundColor: 'rgba(255,255,255,0.26)',
              borderTopLeftRadius: 12, borderTopRightRadius: 12,
            }} />
          )}

          {/* ── Glass cylinder overlays (rendered above liquid) ── */}

          {/* Right-wall shadow zone */}
          <View style={{
            position: 'absolute', right: 0, top: 0, bottom: 0,
            width: '20%',
            backgroundColor: 'rgba(0,0,0,0.09)',
          }} />

          {/* Left soft glow zone */}
          <View style={{
            position: 'absolute', left: 2, top: 6, bottom: br * 0.35,
            width: '30%',
            backgroundColor: 'rgba(255,255,255,0.13)',
            borderRadius: 5,
          }} />

          {/* Bright specular streak */}
          <View style={{
            position: 'absolute',
            left: tubeW * 0.10, top: 4, bottom: br * 0.5,
            width: spec,
            backgroundColor: 'rgba(255,255,255,0.78)',
            borderRadius: 3,
          }} />

          {/* Bottom dome glow */}
          <View style={{
            position: 'absolute', bottom: 4,
            left: '16%', right: '16%',
            height: Math.max(4, br * 0.42),
            backgroundColor: 'rgba(255,255,255,0.13)',
            borderRadius: 5,
          }} />
        </View>
      </View>
    </View>
  );
}

// ── Purchase Modal ─────────────────────────────────────────
function PurchaseModal({ type, onClose, onWatchAd, onBuy }) {
  const label = type === 'undo' ? 'やり直し' : 'ヒント';
  const scale = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }).start();
  }, []);
  return (
    <Modal transparent animationType="fade">
      <View style={s.overlay}>
        <Animated.View style={[s.winCard, { transform: [{ scale }] }]}>
          <Text style={{ fontSize: 44 }}>💎</Text>
          <Text style={[s.winTitle, { fontSize: 22 }]}>{label}アイテムがありません</Text>
          <Text style={{ fontSize: 14, color: GREY, textAlign: 'center', lineHeight: 20 }}>
            広告を見るか、アイテムを購入してください
          </Text>
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: '#27C757' }]} onPress={onWatchAd}>
            <Text style={s.nextBtnTxt}>📺 広告を見て3個もらう</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: '#2F7BF0' }]} onPress={onBuy}>
            <Text style={s.nextBtnTxt}>💎 アイテムを購入</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: GREY }]} onPress={onClose}>
            <Text style={s.nextBtnTxt}>キャンセル</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Win Overlay ────────────────────────────────────────────
function WinOverlay({ moves, stage, stageColor, onNext, onReplay }) {
  const cfg      = getStageConfig(stage);
  const optMoves = cfg.colors * 4;
  const stars    = moves <= optMoves ? 3 : moves <= optMoves * 1.7 ? 2 : 1;
  const scale    = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, []);
  return (
    <View style={s.overlay}>
      <Animated.View style={[s.winCard, { transform: [{ scale }] }]}>
        <Text style={s.winEmoji}>🎉</Text>
        <Text style={s.winTitle}>クリア！</Text>
        <Text style={{ fontSize: 38, color: '#F5C518', letterSpacing: 4 }}>
          {'★'.repeat(stars)}<Text style={{ color: '#DDD' }}>{'★'.repeat(3 - stars)}</Text>
        </Text>
        <Text style={{ fontSize: 15, color: GREY }}>{moves} 手でクリア</Text>
        <TouchableOpacity style={[s.nextBtn, { backgroundColor: stageColor }]} onPress={onNext}>
          <Text style={s.nextBtnTxt}>次のステージ →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.nextBtn, { backgroundColor: GREY }]} onPress={onReplay}>
          <Text style={s.nextBtnTxt}>🔄 もう一度</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ── Game Screen ────────────────────────────────────────────
function GameScreen({ stage, items, onBack, onNext, onStageComplete, onUseItem, onBuyItem }) {
  const cfg = getStageConfig(stage);
  const { colors, cap, empty, stageColor, bandName } = cfg;

  const [tubes, setTubes]           = useState(() => makeLevel(colors, cap, empty, stage));
  const [selected, setSelected]     = useState(null);
  const [moves, setMoves]           = useState(0);
  const [won, setWon]               = useState(false);
  const [history, setHistory]       = useState([]);
  const [purchaseType, setPurchaseType] = useState(null);

  const N     = tubes.length;
  const cols  = N <= 6 ? N : Math.ceil(N / 2);
  const rows  = N <= 6 ? 1 : 2;
  const tubeW = Math.min(Math.floor((SW - 40 - (cols - 1) * 12) / cols), 84);
  // Cap tubeH so all rows fit: header≈64 + itemBar≈58 + safeArea≈100 + gap≈20
  const boardH   = SH - 242;
  const maxTubeH = rows === 2 ? (boardH - 20) / 2 - 13 : boardH - 13;
  const tubeH    = Math.min(tubeW * cap * 0.85, maxTubeH);
  const ballSz   = tubeW - 10;

  const shakeAnims  = useRef(Array.from({ length: N }, () => new Animated.Value(0))).current;
  const bounceAnims = useRef(Array.from({ length: N }, () => new Animated.Value(1))).current;
  const tiltAnims    = useRef(Array.from({ length: N }, () => new Animated.Value(0))).current;
  const moveXAnims   = useRef(Array.from({ length: N }, () => new Animated.Value(0))).current;
  const moveYAnims   = useRef(Array.from({ length: N }, () => new Animated.Value(0))).current;
  const selAnim      = useRef(new Animated.Value(1)).current;
  const tubeViewRefs = useRef([]);
  const [stream, setStream]   = useState(null);
  const streamOpacity = useRef(new Animated.Value(0)).current;
  const drainAnim     = useRef(new Animated.Value(0)).current;
  const fillAnim      = useRef(new Animated.Value(0)).current;
  const [pourInfo, setPourInfo] = useState(null);
  const isAnimating    = useRef(false);
  const completedRef   = useRef(0);

  useEffect(() => {
    if (selected !== null) {
      Animated.loop(Animated.sequence([
        Animated.timing(selAnim, { toValue: 1.07, duration: 350, useNativeDriver: true }),
        Animated.timing(selAnim, { toValue: 1.0,  duration: 350, useNativeDriver: true }),
      ])).start();
    } else {
      selAnim.stopAnimation();
      selAnim.setValue(1);
    }
  }, [selected]);

  function shake(idx) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    playSound('error');
    Animated.sequence([
      Animated.timing(shakeAnims[idx], { toValue: 10,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnims[idx], { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnims[idx], { toValue: 6,   duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnims[idx], { toValue: 0,   duration: 45, useNativeDriver: true }),
    ]).start();
  }

  function bounce(idx) {
    Animated.sequence([
      Animated.timing(bounceAnims[idx], { toValue: 1.1, duration: 80, useNativeDriver: true }),
      Animated.spring(bounceAnims[idx],  { toValue: 1,   friction: 4,  useNativeDriver: true }),
    ]).start();
  }

  function checkWin(ts) {
    return ts.every(t => t.length === 0 || (t.length === cap && t.every(b => b === t[0])));
  }

  function onTap(idx) {
    if (won || isAnimating.current) return;
    if (selected === null) {
      if (!tubes[idx].length) { shake(idx); return; }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      playSound('select');
      setSelected(idx);
      return;
    }
    if (selected === idx) { setSelected(null); return; }

    const from = tubes[selected];
    const to   = tubes[idx];
    if (!from.length || to.length >= cap) { shake(idx); setSelected(null); return; }
    const topColor = from.at(-1);
    if (to.length && to.at(-1) !== topColor) { shake(idx); setSelected(null); return; }

    let cnt = 0;
    for (let i = from.length - 1; i >= 0 && from[i] === topColor; i--) cnt++;
    cnt = Math.min(cnt, cap - to.length);

    setHistory(h => [...h, tubes.map(t => [...t])]);
    const nt = tubes.map(t => [...t]);
    for (let i = 0; i < cnt; i++) nt[idx].push(nt[selected].pop());

    const fromIdx = selected;
    setSelected(null);
    animateMove(fromIdx, idx, topColor, cnt, nt, tubes);
  }

  function animateMove(fromIdx, toIdx, colorIdx, cnt, nt, prevTubes) {
    const fromEl = tubeViewRefs.current[fromIdx];
    const toEl   = tubeViewRefs.current[toIdx];

    function commit() {
      setStream(null);
      streamOpacity.setValue(0);
      tiltAnims[fromIdx].setValue(0);
      moveXAnims[fromIdx].setValue(0);
      moveYAnims[fromIdx].setValue(0);
      drainAnim.setValue(0);
      fillAnim.setValue(0);
      setPourInfo(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setTubes(nt);
      setMoves(m => m + 1);
      bounce(toIdx);
      // Check completions first so the bell always rings, even on the winning move
      const newCompleted = nt.filter(
        t => t.length === cap && t.every(b => b === t[0])
      ).length;
      const justCompleted = newCompleted > completedRef.current;
      completedRef.current = newCompleted;

      if (checkWin(nt)) {
        completedRef.current = 0;
        setWon(true);
        onStageComplete?.(stage);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        playSound('win');
      } else if (justCompleted) {
        playSound(`complete${Math.min(newCompleted, 8)}`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      } else {
        playSound('move');
      }
      isAnimating.current = false;
    }

    if (!fromEl || !toEl) { commit(); return; }

    isAnimating.current = true;
    fromEl.measure((fx, fy, fw, fh, fpx, fpy) => {
      toEl.measure((_tx, _ty, tw, _th, tpx, tpy) => {
        const srcCX = fpx + fw / 2;
        const srcY  = fpy + 4;
        const dstCX = tpx + tw / 2;
        const dstY  = tpy + 4;

        const dir = dstCX >= srcCX ? 1 : -1;

        // Upward move: lift source past the dest so liquid always flows downward
        const isUpwardMove = dstY < srcY - 20;
        const moveXTarget  = (dstCX - srcCX) * 0.55;
        const moveYTarget  = isUpwardMove ? -(srcY - dstY + 70) : -50;
        const tiltAngle    = 44 * dir;

        // Stream position: from tilted+moved source rim → dest rim
        const tiltRad  = (tiltAngle * Math.PI) / 180;
        const halfH    = (tubeH + 12) / 2;
        const movedCX  = srcCX + moveXTarget;
        const movedY   = srcY  + moveYTarget;
        const adjSrcCX = movedCX + halfH * Math.sin(tiltRad);
        const adjSrcY  = movedY  + halfH * (1 - Math.cos(tiltRad));

        const dx  = dstCX - adjSrcCX;
        const dy  = dstY  - adjSrcY;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ang = Math.atan2(dy, dx) * (180 / Math.PI);

        // Show pour overlays on source (drain) and dest (fill) tubes
        drainAnim.setValue(0);
        fillAnim.setValue(0);
        setPourInfo({
          srcIdx:      fromIdx,
          dstIdx:      toIdx,
          drainCnt:    cnt,
          fillColor:   colorIdx,
          dstBallsLen: prevTubes[toIdx].length,
        });

        // Drain starts as tube tilts; fill starts when stream reaches dest
        Animated.sequence([
          Animated.delay(80),
          Animated.timing(drainAnim, {
            toValue: 1, duration: 300,
            easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
        ]).start();

        Animated.sequence([
          Animated.delay(200),
          Animated.timing(fillAnim, {
            toValue: 1, duration: 220,
            easing: Easing.out(Easing.cubic), useNativeDriver: true,
          }),
        ]).start();

        // Stream thickness: source end ≈ 40% of tube width, tapers to 10% at dest
        const streamThick = Math.max(18, tubeW * 0.40);

        streamOpacity.setValue(0);
        setStream({
          color:  PALETTE[colorIdx],
          midX:   adjSrcCX + dx / 2,
          midY:   adjSrcY  + dy / 2,
          length: Math.max(len, 10),
          angle:  ang,
          thick:  streamThick,
        });

        Animated.sequence([
          // Phase 1: tube lifts + moves toward dest + tilts + stream appears
          Animated.parallel([
            Animated.timing(moveXAnims[fromIdx], {
              toValue: moveXTarget, duration: 220,
              easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }),
            Animated.timing(moveYAnims[fromIdx], {
              toValue: moveYTarget, duration: 220,
              easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }),
            Animated.timing(tiltAnims[fromIdx], {
              toValue: tiltAngle, duration: 240,
              easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }),
            Animated.timing(streamOpacity, {
              toValue: 0.92, duration: 220,
              easing: Easing.out(Easing.ease), useNativeDriver: true,
            }),
          ]),
          // Phase 2: hold — liquid flows into dest
          Animated.delay(160),
          // Phase 3: tube un-tilts + returns to origin + stream fades
          Animated.parallel([
            Animated.timing(tiltAnims[fromIdx], {
              toValue: 0, duration: 210,
              easing: Easing.in(Easing.cubic), useNativeDriver: true,
            }),
            Animated.timing(moveXAnims[fromIdx], {
              toValue: 0, duration: 240,
              easing: Easing.inOut(Easing.ease), useNativeDriver: true,
            }),
            Animated.timing(moveYAnims[fromIdx], {
              toValue: 0, duration: 240,
              easing: Easing.inOut(Easing.ease), useNativeDriver: true,
            }),
            Animated.timing(streamOpacity, {
              toValue: 0, duration: 180,
              easing: Easing.in(Easing.ease), useNativeDriver: true,
            }),
          ]),
        ]).start(commit);
      });
    });
  }

  function handleUndo() {
    if (won || isAnimating.current) return;
    if (items.undo <= 0) { setPurchaseType('undo'); return; }
    if (!history.length) return;
    onUseItem('undo');
    const prev = history.at(-1);
    completedRef.current = prev.filter(
      t => t.length === cap && t.every(b => b === t[0])
    ).length;
    setTubes(prev);
    setHistory(h => h.slice(0, -1));
    setMoves(m => Math.max(0, m - 1));
    setSelected(null);
  }

  function handleHint() {
    if (won || isAnimating.current) return;
    if (items.hint <= 0) { setPurchaseType('hint'); return; }
    for (let f = 0; f < tubes.length; f++) {
      if (!tubes[f].length) continue;
      const top = tubes[f].at(-1);
      for (let t = 0; t < tubes.length; t++) {
        if (t === f || tubes[t].length >= cap) continue;
        if (tubes[t].length && tubes[t].at(-1) !== top) continue;
        onUseItem('hint');
        setHistory(h => [...h, tubes.map(x => [...x])]);
        const nt = tubes.map(x => [...x]);
        nt[t].push(nt[f].pop());
        setTubes(nt);
        setMoves(m => m + 1);
        setSelected(null);
        bounce(t);
        if (checkWin(nt)) {
          setWon(true);
          onStageComplete?.(stage);
        }
        return;
      }
    }
  }

  function restart() {
    tiltAnims.forEach(a => a.setValue(0));
    moveXAnims.forEach(a => a.setValue(0));
    moveYAnims.forEach(a => a.setValue(0));
    drainAnim.setValue(0);
    fillAnim.setValue(0);
    setPourInfo(null);
    setStream(null);
    streamOpacity.setValue(0);
    setTubes(makeLevel(colors, cap, empty, stage));
    setSelected(null);
    setMoves(0);
    setWon(false);
    setHistory([]);
    isAnimating.current = false;
    completedRef.current = 0;
  }

  const rowData = rows === 1
    ? [Array.from({ length: N }, (_, i) => i)]
    : [
        Array.from({ length: cols },     (_, i) => i),
        Array.from({ length: N - cols }, (_, i) => i + cols),
      ];

  return (
    <ImageBackground source={require('./assets/background.png')} style={{flex:1}} resizeMode="cover">
      <View style={{...StyleSheet.absoluteFillObject, backgroundColor:'rgba(4,2,14,0.62)'}} />
      <SafeAreaView style={{flex:1}}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[s.header, { backgroundColor: 'rgba(10,6,30,0.80)', borderBottomColor: 'rgba(180,140,55,0.35)' }]}>
        <TouchableOpacity onPress={onBack} style={s.iconBtn}>
          <Text style={[s.iconTxt, { color: '#E8D8A0' }]}>←</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[s.headerTitle, { color: '#E8D8A0' }]}>ステージ {stage}</Text>
          <Text style={{ fontSize: 11, color: stageColor, fontWeight: '700', letterSpacing: 1 }}>
            {bandName}
          </Text>
        </View>
        <Text style={{ fontSize: 14, color: 'rgba(200,180,255,0.7)', minWidth: 44, textAlign: 'right', paddingRight: 8 }}>
          {moves}手
        </Text>
      </View>

      {/* Item bar */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(10,6,30,0.75)', paddingHorizontal: 16, paddingBottom: 10, paddingTop: 6, gap: 10,
        borderBottomWidth: 1, borderBottomColor: 'rgba(180,140,55,0.25)',
      }}>
        <TouchableOpacity
          style={[s.itemBtn, { borderColor: items.undo > 0 ? stageColor : '#E84343', backgroundColor: 'rgba(255,255,255,0.08)' }]}
          onPress={handleUndo}
        >
          <Text style={{ fontSize: 17 }}>↩</Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: items.undo > 0 ? '#E8D8A0' : '#E84343' }}>
            {items.undo}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.itemBtn, { borderColor: items.hint > 0 ? stageColor : '#E84343', backgroundColor: 'rgba(255,255,255,0.08)' }]}
          onPress={handleHint}
        >
          <Text style={{ fontSize: 17 }}>💡</Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: items.hint > 0 ? '#E8D8A0' : '#E84343' }}>
            {items.hint}
          </Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity style={[s.restartBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]} onPress={restart}>
          <Text style={s.restartBtnTxt}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Board */}
      <View style={s.board}>
        {rowData.map((row, ri) => (
          <View key={ri} style={s.tubeRow}>
            {row.map(i => (
              <Animated.View key={i} style={{
                transform: [
                  { translateX: Animated.add(shakeAnims[i], moveXAnims[i]) },
                  { translateY: moveYAnims[i] },
                  { scale: selected === i ? selAnim : bounceAnims[i] },
                  { rotate: tiltAnims[i].interpolate({
                      inputRange: [-45, 0, 45],
                      outputRange: ['-45deg', '0deg', '45deg'],
                    }),
                  },
                ],
              }}>
                <TouchableOpacity
                  ref={el => { tubeViewRefs.current[i] = el; }}
                  onPress={() => onTap(i)}
                  activeOpacity={0.9}
                >
                  <Tube
                    balls={tubes[i]} cap={cap}
                    selected={selected === i}
                    tubeW={tubeW} tubeH={tubeH}
                    stageColor={stageColor}
                    isDraining={pourInfo?.srcIdx === i}
                    drainCnt={pourInfo?.drainCnt ?? 0}
                    drainAnim={drainAnim}
                    isFilling={pourInfo?.dstIdx === i}
                    fillCnt={pourInfo?.drainCnt ?? 0}
                    fillColorIdx={pourInfo?.fillColor ?? 0}
                    fillAnim={fillAnim}
                  />
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        ))}
      </View>

      {won && (
        <WinOverlay
          moves={moves} stage={stage} stageColor={stageColor}
          onNext={onNext} onReplay={restart}
        />
      )}

      {purchaseType && (
        <PurchaseModal
          type={purchaseType}
          onClose={() => setPurchaseType(null)}
          onWatchAd={() => { setPurchaseType(null); onBuyItem(purchaseType, 3, 'ad'); }}
          onBuy={() => { setPurchaseType(null); onBuyItem(purchaseType, 10, 'iap'); }}
        />
      )}

      {/* Tapered liquid pour stream — thick at source, thin at dest */}
      {stream && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', zIndex: 999,
            left:    stream.midX - stream.length / 2,
            top:     stream.midY - stream.thick / 2,
            width:   stream.length,
            height:  stream.thick,
            opacity: streamOpacity,
            transform: [{ rotate: `${stream.angle}deg` }],
            shadowColor:   stream.color,
            shadowOffset:  { width: 0, height: 6 },
            shadowOpacity: 0.55,
            shadowRadius:  10,
          }}
        >
          {Array.from({ length: 14 }, (_, k) => {
            const t    = k / 13;                                    // 0 = source, 1 = dest
            const segW = stream.length / 14;
            const segH = Math.max(2, stream.thick * (1 - t * 0.75)); // tapers to 25%
            const segTop = (stream.thick - segH) / 2;
            const r = segH * 0.45;
            return (
              <View
                key={k}
                style={{
                  position: 'absolute',
                  left: k * segW - 0.5,
                  top: segTop,
                  width: segW + 1,
                  height: segH,
                  backgroundColor: stream.color,
                  borderRadius: r,
                  overflow: 'hidden',
                }}
              >
                {/* Lit top face */}
                <View style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  height: segH * 0.38,
                  backgroundColor: 'rgba(255,255,255,0.34)',
                }} />
                {/* Specular streak */}
                <View style={{
                  position: 'absolute', top: segH * 0.10, left: 0, right: 0,
                  height: Math.max(1, segH * 0.12),
                  backgroundColor: 'rgba(255,255,255,0.52)',
                }} />
                {/* Shadow bottom face */}
                <View style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: segH * 0.32,
                  backgroundColor: 'rgba(0,0,0,0.26)',
                }} />
              </View>
            );
          })}
        </Animated.View>
      )}
      </SafeAreaView>
    </ImageBackground>
  );
}

// ── Stage Select Screen ────────────────────────────────────
function StageSelect({ clearedStages, onPlay }) {
  const nextStage = clearedStages.size > 0 ? Math.max(...clearedStages) + 1 : 1;
  const cfg       = getStageConfig(nextStage);
  const scale     = useRef(new Animated.Value(1)).current;

  function pulse() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.94, duration: 100, useNativeDriver: true }),
      Animated.spring(scale,  { toValue: 1,   friction: 4,   useNativeDriver: true }),
    ]).start();
  }

  return (
    <ImageBackground
      source={require('./assets/background.png')}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle="light-content" />

        {/* Title */}
        <Text style={{
          fontSize: 38, fontWeight: '900', letterSpacing: 4,
          color: '#E8D08A',
          textShadowColor: 'rgba(200,140,255,0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18,
        }}>
          POTION SORT
        </Text>
        <Text style={{ fontSize: 12, color: 'rgba(200,180,255,0.7)', letterSpacing: 3, marginTop: 4 }}>
          ✦ LIQUID PUZZLE ✦
        </Text>

        {clearedStages.size > 0
          ? <Text style={{ fontSize: 13, color: 'rgba(220,200,255,0.65)', marginTop: 10, marginBottom: 52 }}>
              {clearedStages.size} ステージクリア済み
            </Text>
          : <View style={{ height: 62 }} />
        }

        <Animated.View style={{ transform: [{ scale }] }}>
          <TouchableOpacity
            style={{
              backgroundColor: 'rgba(30,15,70,0.82)',
              paddingHorizontal: 48, paddingVertical: 20,
              borderRadius: 32, alignItems: 'center', minWidth: 220,
              borderWidth: 1.5, borderColor: 'rgba(200,160,80,0.7)',
              shadowColor: cfg.stageColor, shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.6, shadowRadius: 20, elevation: 12,
            }}
            onPress={() => { pulse(); onPlay(nextStage); }}
            activeOpacity={1}
          >
            <Text style={{ color: 'rgba(220,190,120,0.85)', fontSize: 11, fontWeight: '700', letterSpacing: 3, marginBottom: 4 }}>
              ── STAGE {nextStage} ──
            </Text>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800',
              textShadowColor: cfg.stageColor, textShadowOffset:{width:0,height:0}, textShadowRadius: 8 }}>
              次のステージへ →
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </ImageBackground>
  );
}

// ── Root ───────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]               = useState('stages');
  const [stage, setStage]                 = useState(1);
  const [clearedStages, setClearedStages] = useState(new Set());
  const [items, setItems]                 = useState(INITIAL_ITEMS);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(PROGRESS_KEY),
      AsyncStorage.getItem(ITEMS_KEY),
    ]).then(([rawP, rawI]) => {
      if (rawP) setClearedStages(new Set(JSON.parse(rawP)));
      if (rawI) setItems(JSON.parse(rawI));
    }).catch(() => {});
    initSounds();
  }, []);

  function saveProgress(set) {
    AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify([...set])).catch(() => {});
  }

  function saveItems(obj) {
    AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(obj)).catch(() => {});
  }

  function handleStageComplete(stageNum) {
    setClearedStages(prev => {
      if (prev.has(stageNum)) return prev;
      const next = new Set(prev);
      next.add(stageNum);
      saveProgress(next);
      return next;
    });
  }

  function handleUseItem(type) {
    setItems(prev => {
      const next = { ...prev, [type]: Math.max(0, prev[type] - 1) };
      saveItems(next);
      return next;
    });
  }

  function handleBuyItem(type, count, method) {
    if (method === 'ad') {
      // TODO: show rewarded ad then grant items
      setItems(prev => {
        const next = { ...prev, [type]: prev[type] + count };
        saveItems(next);
        return next;
      });
    } else {
      // TODO: trigger IAP flow
    }
  }

  if (screen === 'game') {
    return (
      <GameScreen
        key={stage}
        stage={stage}
        items={items}
        onBack={() => setScreen('stages')}
        onNext={() => setStage(s => s + 1)}
        onStageComplete={handleStageComplete}
        onUseItem={handleUseItem}
        onBuyItem={handleBuyItem}
      />
    );
  }

  return (
    <StageSelect
      clearedStages={clearedStages}
      onPlay={stageNum => { setStage(stageNum); setScreen('game'); }}
    />
  );
}

// ── Styles ─────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: BG },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E4E6F0' },
  iconBtn:       { padding: 8, minWidth: 44, alignItems: 'center' },
  iconTxt:       { fontSize: 24, color: DARK },
  headerTitle:   { fontSize: 20, fontWeight: '700', color: DARK },
  board:         { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 },
  tubeRow:       { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  itemBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, borderWidth: 1.5, backgroundColor: '#F5F6FB' },
  restartBtn:    { width: 42, height: 42, backgroundColor: '#E4E6F0', borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  restartBtnTxt: { fontSize: 20 },
  overlay:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  winCard:       { backgroundColor: '#fff', borderRadius: 28, padding: 32, alignItems: 'center', width: SW * 0.82, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 20 },
  winEmoji:      { fontSize: 52 },
  winTitle:      { fontSize: 28, fontWeight: '800', color: DARK },
  nextBtn:       { paddingHorizontal: 32, paddingVertical: 16, borderRadius: 30, width: '100%', alignItems: 'center' },
  nextBtnTxt:    { color: '#fff', fontSize: 17, fontWeight: '700' },
  selTitle:      { fontSize: 26, fontWeight: '900', color: DARK, letterSpacing: 2 },
  stageBtn:      { width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
