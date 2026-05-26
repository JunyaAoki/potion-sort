import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Dimensions, SafeAreaView, StatusBar, Animated, Easing, Modal,
  ImageBackground, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { initSounds, playSound, playBGM, pauseBGM, setBGMEnabled, isBGMEnabled } from './sounds';
import { loadRewarded, showRewarded, loadInterstitial, showInterstitial, BannerAd, BannerAdSize, AD_IDS } from './ads';
import * as StoreReview from 'expo-store-review';
import {
  requestNotificationPermission,
  scheduleHeartFullNotification,
  scheduleDailyReminder,
} from './notifications';

const { width: SW, height: SH } = Dimensions.get('window');

// ── Palette ────────────────────────────────────────────────
const PALETTE = [
  '#E84343','#2F7BF0','#27C757','#F57C00',
  '#8B30E8','#F0C800','#E8509A','#18B8C8',
  '#8B5E3C','#4A5AAD',
  '#FF6B35','#00BFA5',
];
const BG   = '#F0F2F8';
const DARK = '#1A1E2E';
const GREY = '#888FA8';

// ── Stage Config（5ステージごとに難易度アップ）─────────────
const TIERS = [
  // ── cap 4 series (stages 1-20) ──
  { colors: 4,  cap: 4, empty: 2 },  // 1-5
  { colors: 5,  cap: 4, empty: 2 },  // 6-10
  { colors: 6,  cap: 4, empty: 2 },  // 11-15
  { colors: 7,  cap: 4, empty: 2 },  // 16-20
  // ── cap 5 series (stages 21-50) ──
  { colors: 7,  cap: 5, empty: 2 },  // 21-25
  { colors: 8,  cap: 5, empty: 2 },  // 26-30
  { colors: 9,  cap: 5, empty: 2 },  // 31-35
  { colors: 10, cap: 5, empty: 2 },  // 36-40
  { colors: 10, cap: 5, empty: 2 },  // 41-45
  { colors: 10, cap: 5, empty: 2 },  // 46-50
  // ── cap 6 series (stages 51-100) ──
  { colors: 6,  cap: 6, empty: 2 },  // 51-55
  { colors: 7,  cap: 6, empty: 2 },  // 56-60
  { colors: 8,  cap: 6, empty: 2 },  // 61-65
  { colors: 9,  cap: 6, empty: 2 },  // 66-70
  { colors: 10, cap: 6, empty: 2 },  // 71-75
  { colors: 10, cap: 6, empty: 2 },  // 76-80
  { colors: 11, cap: 6, empty: 2 },  // 81-85
  { colors: 11, cap: 6, empty: 2 },  // 86-90
  { colors: 12, cap: 6, empty: 2 },  // 91-95
  { colors: 12, cap: 6, empty: 2 },  // 96-100
  // ── 1 empty tube series (stages 101-150) ──
  { colors: 7,  cap: 5, empty: 1 },  // 101-105
  { colors: 8,  cap: 5, empty: 1 },  // 106-110
  { colors: 9,  cap: 5, empty: 1 },  // 111-115
  { colors: 10, cap: 5, empty: 1 },  // 116-120
  { colors: 8,  cap: 6, empty: 1 },  // 121-125
  { colors: 9,  cap: 6, empty: 1 },  // 126-130
  { colors: 10, cap: 6, empty: 1 },  // 131-135
  { colors: 11, cap: 6, empty: 1 },  // 136-140
  { colors: 11, cap: 6, empty: 1 },  // 141-145
  { colors: 12, cap: 6, empty: 1 },  // 146-150
  // ── ultimate series (stages 151-200) ──
  { colors: 9,  cap: 6, empty: 1 },  // 151-155
  { colors: 10, cap: 6, empty: 1 },  // 156-160
  { colors: 10, cap: 6, empty: 1 },  // 161-165
  { colors: 11, cap: 6, empty: 1 },  // 166-170
  { colors: 11, cap: 6, empty: 1 },  // 171-175
  { colors: 12, cap: 6, empty: 1 },  // 176-180
  { colors: 12, cap: 6, empty: 1 },  // 181-185
  { colors: 12, cap: 6, empty: 1 },  // 186-190
  { colors: 12, cap: 6, empty: 1 },  // 191-195
  { colors: 12, cap: 6, empty: 1 },  // 196-200
];

const BANDS = [
  { name: 'EASY',     color: '#27C757', start: 1,   end: 10  },
  { name: 'NORMAL',   color: '#2F7BF0', start: 11,  end: 20  },
  { name: 'HARD',     color: '#F57C00', start: 21,  end: 30  },
  { name: 'EXPERT',   color: '#E84343', start: 31,  end: 40  },
  { name: 'MASTER',   color: '#8B30E8', start: 41,  end: 50  },
  { name: 'LEGEND',   color: '#F0C800', start: 51,  end: 60  },
  { name: 'MYTHIC',   color: '#E8509A', start: 61,  end: 70  },
  { name: 'DIVINE',   color: '#18B8C8', start: 71,  end: 80  },
  { name: 'ETERNAL',  color: '#8B5E3C', start: 81,  end: 90  },
  { name: 'VOID',     color: '#4A5AAD', start: 91,  end: 100 },
  { name: 'SHADOW',   color: '#FF6B35', start: 101, end: 110 },
  { name: 'CHAOS',    color: '#00BFA5', start: 111, end: 120 },
  { name: 'APEX',     color: '#CC3366', start: 121, end: 130 },
  { name: 'ZENITH',   color: '#33AA77', start: 131, end: 140 },
  { name: 'OMEGA',    color: '#AA5500', start: 141, end: 150 },
  { name: 'ALPHA',    color: '#5533CC', start: 151, end: 160 },
  { name: 'ULTIMA',   color: '#CC7700', start: 161, end: 170 },
  { name: 'SUPREME',  color: '#0099AA', start: 171, end: 180 },
  { name: 'INFINITE', color: '#AA2244', start: 181, end: 190 },
  { name: 'ABSOLUTE', color: '#8844AA', start: 191, end: 200 },
];

function getStageConfig(stageNum) {
  const idx   = Math.min(Math.floor((stageNum - 1) / 5), TIERS.length - 1);
  const band  = BANDS[Math.min(Math.floor((stageNum - 1) / 10), BANDS.length - 1)];
  return { ...TIERS[idx], stageColor: band.color };
}

const INITIAL_ITEMS   = { undo: 5, hint: 5 };
const ITEMS_KEY       = 'ballsort_items_v1';
const PROGRESS_KEY    = 'ballsort_progress_v2';
const TUTORIAL_KEY    = 'ballsort_tutorial_v1';
const HEARTS_KEY      = 'ballsort_hearts_v1';
const MAX_HEARTS      = 5;
const HEART_REGEN_MS  = 30 * 60 * 1000; // 30分
const COINS_KEY       = 'ballsort_coins_v1';
const COIN_PER_STAR   = [0, 15, 30, 50]; // index = stars
const DAILY_KEY       = 'ballsort_daily_v1';
const REVIEW_KEY      = 'ballsort_review_v1';
const REVIEW_STAGE    = 10;
const CHALLENGE_KEY   = 'ballsort_challenge_v1';
const ACHIEVE_KEY     = 'ballsort_achieve_v1';
const WEEKLY_KEY      = 'ballsort_weekly_v1';
const BGM_KEY         = 'ballsort_bgm_v1';
const COLORBLIND_KEY  = 'ballsort_colorblind_v1';
const STARS_KEY       = 'ballsort_stars_v1';

// 色覚サポート用シンボル（色ごとに固有の記号）
const CB_SYMBOLS = ['✕','◆','★','▲','●','■','♥','○','▼','✦','♦','♣'];

// コインパック定義（IAP準備済み）
const COIN_PACKS = [
  { id: 'coins_200',  coins: 200,  label: '¥120', emoji: '🪙' },
  { id: 'coins_600',  coins: 600,  label: '¥370', emoji: '💰' },
  { id: 'coins_1500', coins: 1500, label: '¥750', emoji: '💎', badge: 'お得！' },
];

// ── Weekly Missions ────────────────────────────────────────
const WEEKLY_MISSIONS = [
  { id: 'w_clear3',    emoji: '🎯', title: '3ステージクリア',    desc: '今週3ステージをクリア',       target: 3, reward: 50,  type: 'clear' },
  { id: 'w_clear7',    emoji: '⚡', title: '7ステージクリア',    desc: '今週7ステージをクリア',       target: 7, reward: 120, type: 'clear' },
  { id: 'w_perfect3',  emoji: '⭐', title: '3つ星を3回',         desc: '3つ星で3回クリア',            target: 3, reward: 80,  type: 'perfect' },
  { id: 'w_challenge', emoji: '🧪', title: 'チャレンジクリア',   desc: 'デイリーチャレンジをクリア',  target: 1, reward: 60,  type: 'challenge' },
];

function getWeekKey() {
  const d    = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function initWeeklyProgress() {
  return { weekKey: getWeekKey(), progress: Object.fromEntries(WEEKLY_MISSIONS.map(m => [m.id, { current: 0, claimed: false }])) };
}

// ── Achievements ───────────────────────────────────────────
const ACHIEVEMENTS = [
  { id: 'first_clear',  emoji: '🎉', title: '初クリア',          desc: '初めてステージをクリア' },
  { id: 'clear_5',      emoji: '🌱', title: '5ステージ制覇',     desc: '5ステージをクリア' },
  { id: 'clear_10',     emoji: '🏅', title: '10ステージ制覇',    desc: '10ステージをクリア' },
  { id: 'clear_30',     emoji: '🏆', title: '30ステージ制覇',    desc: '30ステージをクリア' },
  { id: 'clear_50',     emoji: '💫', title: '50ステージ制覇',    desc: '50ステージをクリア' },
  { id: 'clear_100',    emoji: '💎', title: '100ステージ制覇',   desc: '100ステージをクリア' },
  { id: 'clear_150',    emoji: '🌟', title: '150ステージ制覇',   desc: '150ステージをクリア' },
  { id: 'clear_200',    emoji: '👑', title: '全ステージ完全制覇', desc: '全200ステージをクリア' },
  { id: 'perfect',      emoji: '⭐', title: '完璧攻略',          desc: '3つ星でクリア' },
  { id: 'daily_7',      emoji: '🔥', title: '7日連続ログイン',   desc: '7日間連続でログイン' },
  { id: 'challenge',    emoji: '🧪', title: 'チャレンジャー',    desc: 'デイリーチャレンジをクリア' },
];

function getDailyChallengeConfig() {
  const today = new Date().toISOString().slice(0, 10);
  const seed  = today.split('-').reduce((acc, n) => acc * 31 + parseInt(n), 1);
  // 曜日（0=日〜6=土）で難易度を変化させる
  const dow = new Date().getDay();
  const DAILY_TIERS = [
    { colors: 6,  cap: 4, empty: 2 }, // 日: 易
    { colors: 7,  cap: 4, empty: 2 }, // 月
    { colors: 8,  cap: 5, empty: 2 }, // 火
    { colors: 9,  cap: 5, empty: 2 }, // 水
    { colors: 10, cap: 5, empty: 2 }, // 木
    { colors: 10, cap: 6, empty: 2 }, // 金
    { colors: 12, cap: 6, empty: 1 }, // 土: 最難
  ];
  const { colors, cap, empty } = DAILY_TIERS[dow];
  return { colors, cap, empty, seed, dateStr: today };
}
const DAILY_REWARDS   = [
  { day: 1, coins: 20,  hearts: 0 },
  { day: 2, coins: 30,  hearts: 0 },
  { day: 3, coins: 40,  hearts: 1 },
  { day: 4, coins: 50,  hearts: 0 },
  { day: 5, coins: 60,  hearts: 1 },
  { day: 6, coins: 80,  hearts: 0 },
  { day: 7, coins: 100, hearts: 3 },
];

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
// 完成状態から逆方向にランダム移動してスクランブル → 必ず解ける配置を保証
function makeLevel(numColors, cap, numEmpty, seed) {
  const rand = seededRand(seed);
  const N = numColors + numEmpty;

  // 完成状態からスタート
  const tubes = [];
  for (let c = 0; c < numColors; c++) tubes.push(Array(cap).fill(c));
  for (let i = 0; i < numEmpty; i++) tubes.push([]);

  // 空チューブが少ないほど制約が強く混ざりにくいので追加ステップ数を増やす
  const emptyMult = numEmpty === 1 ? 20 : 12;
  const steps = numColors * cap * emptyMult;
  for (let s = 0; s < steps; s++) {
    const froms = [];
    for (let i = 0; i < N; i++) if (tubes[i].length > 0) froms.push(i);
    const fi = froms[(rand() * froms.length) | 0];

    const tos = [];
    for (let i = 0; i < N; i++) {
      if (i !== fi && tubes[i].length < cap) tos.push(i);
    }
    if (tos.length === 0) continue;
    const ti = tos[(rand() * tos.length) | 0];

    tubes[ti].push(tubes[fi].pop());
  }

  return tubes;
}

// ── Tube ───────────────────────────────────────────────────
function Tube({ balls, cap, selected, tubeW, tubeH, stageColor,
                isDraining, drainCnt, drainAnim,
                isFilling,  fillCnt,  fillColorIdx, fillAnim,
                colorblindMode }) {
  const br   = tubeW / 2;
  const segH = tubeH / cap;
  const bw   = selected ? 2.5 : 1.5;
  const spec = Math.max(3, tubeW * 0.075);

  const meniscusAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(meniscusAnim, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(meniscusAnim, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

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
                {/* 色覚サポート記号 */}
                {colorblindMode && (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: Math.max(8, tubeW * 0.22), color: 'rgba(255,255,255,0.95)', fontWeight: '900' }}>
                      {CB_SYMBOLS[colorIdx % CB_SYMBOLS.length]}
                    </Text>
                  </View>
                )}
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

          {/* Meniscus curve on top of visible liquid — bobs gently */}
          {visibleBalls.length > 0 && !isDraining && !isFilling && (
            <Animated.View style={{
              position: 'absolute',
              bottom: segH * visibleBalls.length - segH * 0.19,
              left: 0, right: 0, height: segH * 0.19,
              backgroundColor: 'rgba(255,255,255,0.26)',
              borderTopLeftRadius: 12, borderTopRightRadius: 12,
              transform: [{ translateY: meniscusAnim.interpolate({
                inputRange: [0, 1], outputRange: [0, -segH * 0.06],
              }) }],
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

// ── Tutorial Overlay ───────────────────────────────────────
const TUTORIAL_STEPS = [
  { emoji: '👆', title: 'チューブをタップ', desc: '液体の入ったチューブをタップして選択します。光っているチューブが選択中です。' },
  { emoji: '➡️', title: '移動先をタップ',  desc: '移動先のチューブをタップします。\n同じ色か、空のチューブに移動できます。' },
  { emoji: '🎯', title: 'ゴール！',         desc: '全てのチューブを\n同じ色の液体で揃えるとクリアです！' },
];

function TutorialOverlay({ step, onNext, onSkip }) {
  const cur   = TUTORIAL_STEPS[step - 1];
  const scale = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    scale.setValue(0.85);
    Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }).start();
  }, [step]);
  return (
    <View style={[s.overlay, { backgroundColor: 'rgba(4,2,14,0.80)' }]}>
      <Animated.View style={[s.winCard, { transform: [{ scale }] }]}>
        <Text style={{ fontSize: 52 }}>{cur.emoji}</Text>
        <Text style={[s.winTitle, { fontSize: 22 }]}>{cur.title}</Text>
        <Text style={{ fontSize: 15, color: GREY, textAlign: 'center', lineHeight: 22 }}>
          {cur.desc}
        </Text>
        <Text style={{ fontSize: 12, color: GREY, marginTop: -4 }}>{step} / {TUTORIAL_STEPS.length}</Text>
        <TouchableOpacity style={[s.nextBtn, { backgroundColor: '#2F7BF0' }]} onPress={onNext}>
          <Text style={s.nextBtnTxt}>
            {step < TUTORIAL_STEPS.length ? '次へ →' : 'さあ始めよう！'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSkip} style={{ paddingVertical: 6 }}>
          <Text style={{ fontSize: 13, color: GREY }}>スキップ</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ── Purchase Modal ─────────────────────────────────────────
// ── Daily Bonus Modal ──────────────────────────────────────
function DailyBonusModal({ streak, reward, onClaim }) {
  const scale    = useRef(new Animated.Value(0.7)).current;
  const coinAnim = useRef(new Animated.Value(0)).current;
  const [displayCoins, setDisplayCoins] = useState(0);

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    const id = coinAnim.addListener(({ value }) => setDisplayCoins(Math.floor(value)));
    Animated.timing(coinAnim, {
      toValue: reward.coins, duration: 900, delay: 300,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    return () => coinAnim.removeListener(id);
  }, []);

  return (
    <Modal transparent animationType="fade">
      <View style={s.overlay}>
        <Animated.View style={[s.winCard, { transform: [{ scale }], gap: 10 }]}>
          <Text style={{ fontSize: 48 }}>🎁</Text>
          <Text style={[s.winTitle, { fontSize: 22 }]}>デイリーボーナス！</Text>

          {/* 7-day progress */}
          <View style={{ flexDirection: 'row', gap: 6, marginVertical: 4 }}>
            {DAILY_REWARDS.map((r, i) => {
              const day      = i + 1;
              const cleared  = day < streak;
              const isToday  = day === streak;
              return (
                <View key={day} style={{
                  flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10,
                  backgroundColor: isToday
                    ? 'rgba(245,197,24,0.25)'
                    : cleared ? 'rgba(39,199,87,0.15)' : 'rgba(255,255,255,0.06)',
                  borderWidth: 1.5,
                  borderColor: isToday ? '#F5C518' : cleared ? '#27C757' : 'rgba(255,255,255,0.12)',
                }}>
                  <Text style={{ fontSize: cleared ? 14 : 10 }}>{cleared ? '✅' : `${day}日`}</Text>
                  {!cleared && <Text style={{ fontSize: 9, color: '#F5C518', fontWeight: '700' }}>🪙{r.coins}</Text>}
                </View>
              );
            })}
          </View>

          {/* Today's reward */}
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 13, color: GREY }}>{streak}日目のボーナス</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: 'rgba(245,197,24,0.12)', paddingHorizontal: 24, paddingVertical: 12,
              borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(245,197,24,0.4)' }}>
              <Text style={{ fontSize: 26 }}>🪙</Text>
              <Text style={{ fontSize: 30, fontWeight: '900', color: '#F5C518' }}>+{displayCoins}</Text>
              {reward.hearts > 0 && (
                <>
                  <Text style={{ fontSize: 20, color: GREY }}>＋</Text>
                  <Text style={{ fontSize: 22 }}>{'❤️'.repeat(reward.hearts)}</Text>
                </>
              )}
            </View>
          </View>

          <TouchableOpacity style={[s.nextBtn, { backgroundColor: '#F57C00' }]} onPress={onClaim}>
            <Text style={s.nextBtnTxt}>✨ 受け取る！</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Review Modal ───────────────────────────────────────────
// ── Achievement Toast ───────────────────────────────────────
function AchievementToast({ achievement, onDone }) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0,    duration: 400, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 1,    duration: 300, useNativeDriver: true }),
      ]),
      Animated.delay(2200),
      Animated.parallel([
        Animated.timing(translateY, { toValue: -100, duration: 300, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,    duration: 300, useNativeDriver: true }),
      ]),
    ]).start(onDone);
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute', top: 60, left: 20, right: 20, zIndex: 9999,
      transform: [{ translateY }], opacity,
      backgroundColor: 'rgba(20,10,50,0.95)',
      borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14,
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1.5, borderColor: 'rgba(200,160,80,0.6)',
      shadowColor: '#F5C518', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4, shadowRadius: 12, elevation: 12,
    }}>
      <Text style={{ fontSize: 32 }}>{achievement.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, color: 'rgba(200,160,80,0.8)', fontWeight: '700', letterSpacing: 2 }}>
          実績解除！
        </Text>
        <Text style={{ fontSize: 15, fontWeight: '800', color: '#E8D8A0' }}>{achievement.title}</Text>
        <Text style={{ fontSize: 11, color: 'rgba(200,180,255,0.65)' }}>{achievement.desc}</Text>
      </View>
    </Animated.View>
  );
}

// ── Review Modal ───────────────────────────────────────────
function ReviewModal({ onRate, onLater, onNo }) {
  const scale = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, []);
  return (
    <Modal transparent animationType="fade">
      <View style={s.overlay}>
        <Animated.View style={[s.winCard, { transform: [{ scale }], gap: 12 }]}>
          <Text style={{ fontSize: 52 }}>⭐</Text>
          <Text style={[s.winTitle, { fontSize: 22, textAlign: 'center' }]}>
            楽しんでいただけていますか？
          </Text>
          <Text style={{ fontSize: 14, color: GREY, textAlign: 'center', lineHeight: 20 }}>
            レビューを書いていただけると{'\n'}開発の励みになります！
          </Text>
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: '#F5C518' }]} onPress={onRate}>
            <Text style={[s.nextBtnTxt, { color: '#333' }]}>⭐ レビューを書く</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: '#2F7BF0' }]} onPress={onLater}>
            <Text style={s.nextBtnTxt}>あとで</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNo} style={{ paddingVertical: 4 }}>
            <Text style={{ fontSize: 13, color: GREY }}>表示しない</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
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

// ── Toggle Row (設定用) ────────────────────────────────────
function ToggleRow({ label, desc, value, onToggle }) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.75} style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      width: '100%', paddingVertical: 12, paddingHorizontal: 4,
      borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
    }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontSize: 14, color: '#E8D8A0', fontWeight: '700' }}>{label}</Text>
        {desc && <Text style={{ fontSize: 11, color: GREY, marginTop: 2 }}>{desc}</Text>}
      </View>
      <View style={{
        width: 50, height: 28, borderRadius: 14,
        backgroundColor: value ? '#27C757' : 'rgba(255,255,255,0.18)',
        alignItems: value ? 'flex-end' : 'flex-start',
        justifyContent: 'center', paddingHorizontal: 3,
      }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
          shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 }} />
      </View>
    </TouchableOpacity>
  );
}

// ── Settings Modal ─────────────────────────────────────────
function SettingsModal({ bgmOn, colorblind, onToggleBGM, onToggleColorblind, onClose }) {
  const scale = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, []);
  return (
    <Modal transparent animationType="fade">
      <View style={s.overlay}>
        <Animated.View style={[s.winCard, { transform: [{ scale }], gap: 4 }]}>
          <Text style={{ fontSize: 36 }}>⚙️</Text>
          <Text style={[s.winTitle, { fontSize: 20, marginBottom: 8 }]}>設定</Text>
          <ToggleRow label="🎵 BGM" desc="バックグラウンド音楽" value={bgmOn} onToggle={onToggleBGM} />
          <ToggleRow label="♿ 色覚サポート" desc="各チューブに識別記号を表示" value={colorblind} onToggle={onToggleColorblind} />
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: GREY, marginTop: 12 }]} onPress={onClose}>
            <Text style={s.nextBtnTxt}>閉じる</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Achievement List Modal ─────────────────────────────────
function AchievementListModal({ earnedAchieves, onClose }) {
  const scale = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, []);
  const earned = earnedAchieves.size;
  return (
    <Modal transparent animationType="fade">
      <View style={s.overlay}>
        <Animated.View style={[s.winCard, { transform: [{ scale }], gap: 8, paddingVertical: 24, maxHeight: SH * 0.82 }]}>
          <Text style={{ fontSize: 36 }}>🏆</Text>
          <Text style={[s.winTitle, { fontSize: 20 }]}>実績</Text>
          <Text style={{ fontSize: 12, color: GREY, marginTop: -4 }}>{earned}/{ACHIEVEMENTS.length} 解除済み</Text>

          {/* Progress bar */}
          <View style={{ width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ width: `${(earned / ACHIEVEMENTS.length) * 100}%`, height: '100%', backgroundColor: '#F5C518', borderRadius: 3 }} />
          </View>

          <ScrollView style={{ width: '100%' }} showsVerticalScrollIndicator={false}>
            {ACHIEVEMENTS.map(a => {
              const isEarned = earnedAchieves.has(a.id);
              return (
                <View key={a.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingVertical: 10, paddingHorizontal: 10, marginBottom: 6, borderRadius: 14,
                  backgroundColor: isEarned ? 'rgba(245,197,24,0.10)' : 'rgba(255,255,255,0.04)',
                  borderWidth: 1.5,
                  borderColor: isEarned ? 'rgba(245,197,24,0.45)' : 'rgba(255,255,255,0.08)',
                  opacity: isEarned ? 1 : 0.5,
                }}>
                  <Text style={{ fontSize: 28 }}>{a.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: isEarned ? '#E8D8A0' : GREY }}>
                      {isEarned ? a.title : '???'}
                    </Text>
                    <Text style={{ fontSize: 11, color: GREY }}>
                      {isEarned ? a.desc : '???'}
                    </Text>
                  </View>
                  {isEarned && <Text style={{ fontSize: 18 }}>✅</Text>}
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={[s.nextBtn, { backgroundColor: GREY, marginTop: 4 }]} onPress={onClose}>
            <Text style={s.nextBtnTxt}>閉じる</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Weekly Missions Modal ──────────────────────────────────
function WeeklyMissionsModal({ weekly, coins, onClaim, onClose }) {
  const scale = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, []);
  return (
    <Modal transparent animationType="fade">
      <View style={s.overlay}>
        <Animated.View style={[s.winCard, { transform: [{ scale }], gap: 10, paddingVertical: 24 }]}>
          <Text style={{ fontSize: 36 }}>📋</Text>
          <Text style={[s.winTitle, { fontSize: 20 }]}>ウィークリーミッション</Text>
          <Text style={{ fontSize: 11, color: GREY, marginTop: -6 }}>今週のリセットまで残り{
            (() => {
              const now  = new Date();
              const next = new Date(now);
              next.setDate(now.getDate() + (7 - now.getDay()) % 7 + 1);
              next.setHours(0, 0, 0, 0);
              const ms   = next - now;
              const h    = Math.floor(ms / 3600000);
              const m    = Math.floor((ms % 3600000) / 60000);
              return `${h}時間${m}分`;
            })()
          }</Text>

          {WEEKLY_MISSIONS.map(m => {
            const p       = weekly.progress[m.id] ?? { current: 0, claimed: false };
            const done    = p.current >= m.target;
            const claimed = p.claimed;
            const pct     = Math.min(1, p.current / m.target);
            return (
              <View key={m.id} style={{
                width: '100%',
                backgroundColor: claimed ? 'rgba(39,199,87,0.1)' : done ? 'rgba(245,197,24,0.1)' : 'rgba(255,255,255,0.05)',
                borderRadius: 14, padding: 12,
                borderWidth: 1,
                borderColor: claimed ? '#27C757' : done ? '#F5C518' : 'rgba(255,255,255,0.12)',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 24 }}>{m.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: claimed ? '#27C757' : '#E8D8A0' }}>
                      {m.title}
                    </Text>
                    <Text style={{ fontSize: 11, color: GREY }}>{m.desc}</Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#F5C518' }}>🪙+{m.reward}</Text>
                </View>

                {/* Progress bar */}
                <View style={{ marginTop: 8, height: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: claimed ? '#27C757' : done ? '#F5C518' : '#2F7BF0', borderRadius: 3 }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                  <Text style={{ fontSize: 10, color: GREY }}>{Math.min(p.current, m.target)}/{m.target}</Text>
                  {done && !claimed && (
                    <TouchableOpacity onPress={() => onClaim(m.id, m.reward)}
                      style={{ backgroundColor: '#F5C518', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#333' }}>受け取る！</Text>
                    </TouchableOpacity>
                  )}
                  {claimed && <Text style={{ fontSize: 10, color: '#27C757', fontWeight: '700' }}>✅ 受取済み</Text>}
                </View>
              </View>
            );
          })}

          <TouchableOpacity style={[s.nextBtn, { backgroundColor: GREY, marginTop: 4 }]} onPress={onClose}>
            <Text style={s.nextBtnTxt}>閉じる</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Win Overlay ────────────────────────────────────────────
const SPARKLE_EMOJIS = ['⭐','✨','💫','🌟','⚡','💛','🔆','🌠'];

function WinOverlay({ moves, stage, stageColor, coinsEarned, onNext, onReplay }) {
  const cfg      = getStageConfig(stage);
  const optMoves = cfg.colors * cfg.cap;
  const stars    = moves <= optMoves ? 3 : moves <= optMoves * 1.7 ? 2 : 1;
  const scale    = useRef(new Animated.Value(0.5)).current;
  const coinAnim = useRef(new Animated.Value(0)).current;
  const [displayCoins, setDisplayCoins] = useState(0);
  const starAnims = useRef([
    new Animated.Value(0), new Animated.Value(0), new Animated.Value(0),
  ]).current;
  const particles = useRef(SPARKLE_EMOJIS.map(() => ({
    x: new Animated.Value(0), y: new Animated.Value(0),
    op: new Animated.Value(0), sc: new Animated.Value(0),
  }))).current;

  const CONF_COUNT = 28;
  const confetti = useRef(
    Array.from({ length: CONF_COUNT }, (_, i) => ({
      x:     new Animated.Value((i / CONF_COUNT - 0.5) * SW * 1.3),
      y:     new Animated.Value(-30 - (i % 5) * 22),
      rot:   new Animated.Value(0),
      color: PALETTE[i % PALETTE.length],
      w:     6 + (i % 3) * 3,
      h:     3 + (i % 2) * 4,
      delay: i * 45,
      dur:   1700 + (i % 6) * 180,
    }))
  ).current;

  useEffect(() => {
    // Card in
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();

    // Stars pop in one by one
    starAnims.forEach((a, i) => {
      Animated.sequence([
        Animated.delay(300 + i * 150),
        Animated.spring(a, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      ]).start();
    });

    // Coin count up
    const id = coinAnim.addListener(({ value }) => setDisplayCoins(Math.floor(value)));
    Animated.timing(coinAnim, {
      toValue: coinsEarned, duration: 1000, delay: 600,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();

    // Sparkle particles
    particles.forEach((p, i) => {
      const angle = (i / particles.length) * Math.PI * 2;
      const dist  = 90 + (i % 3) * 20;
      Animated.sequence([
        Animated.delay(180 + i * 55),
        Animated.parallel([
          Animated.timing(p.x,  { toValue: Math.cos(angle) * dist, duration: 650, useNativeDriver: true }),
          Animated.timing(p.y,  { toValue: Math.sin(angle) * dist - 30, duration: 650, useNativeDriver: true }),
          Animated.timing(p.sc, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(p.op, { toValue: 1, duration: 100, useNativeDriver: true }),
            Animated.timing(p.op, { toValue: 0, duration: 550, delay: 100, useNativeDriver: true }),
          ]),
        ]),
      ]).start();
    });

    // Confetti fall
    confetti.forEach((p) => {
      Animated.sequence([
        Animated.delay(p.delay),
        Animated.parallel([
          Animated.timing(p.y,   { toValue: SH + 60,  duration: p.dur, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(p.rot, { toValue: 4,         duration: p.dur, easing: Easing.linear, useNativeDriver: true }),
        ]),
      ]).start();
    });

    return () => coinAnim.removeListener(id);
  }, []);

  return (
    <View style={s.overlay}>
      {/* Confetti */}
      <View style={{ ...StyleSheet.absoluteFillObject, overflow: 'hidden', pointerEvents: 'none' }}>
        {confetti.map((p, i) => (
          <Animated.View key={`cf${i}`} style={{
            position: 'absolute', top: 0, left: '50%',
            width: p.w, height: p.h,
            backgroundColor: p.color,
            borderRadius: 2,
            opacity: 0.88,
            transform: [
              { translateX: p.x },
              { translateY: p.y },
              { rotate: p.rot.interpolate({ inputRange: [0, 4], outputRange: ['0deg', '720deg'] }) },
            ],
          }} />
        ))}
      </View>
      {/* Sparkle particles */}
      <View style={{ position: 'absolute', top: '38%', left: '50%' }}>
        {particles.map((p, i) => (
          <Animated.View key={i} style={{
            position: 'absolute',
            transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.sc }],
            opacity: p.op,
          }}>
            <Text style={{ fontSize: 18 }}>{SPARKLE_EMOJIS[i]}</Text>
          </Animated.View>
        ))}
      </View>

      <Animated.View style={[s.winCard, { transform: [{ scale }] }]}>
        <Text style={s.winEmoji}>🎉</Text>
        <Text style={s.winTitle}>クリア！</Text>

        {/* Stars animate in */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {starAnims.map((a, i) => (
            <Animated.Text key={i} style={{
              fontSize: 38,
              color: i < stars ? '#F5C518' : '#DDD',
              transform: [{ scale: a }],
            }}>★</Animated.Text>
          ))}
        </View>

        {/* Coin reward */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: 'rgba(245,197,24,0.12)',
          paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24,
          borderWidth: 1.5, borderColor: 'rgba(245,197,24,0.45)',
          marginVertical: 4,
        }}>
          <Text style={{ fontSize: 28 }}>🪙</Text>
          <Text style={{ fontSize: 32, fontWeight: '900', color: '#F5C518' }}>+{displayCoins}</Text>
        </View>

        <Text style={{ fontSize: 14, color: GREY }}>{moves} 手でクリア</Text>

        {stage < TOTAL_STAGES ? (
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: stageColor }]} onPress={onNext}>
            <Text style={s.nextBtnTxt}>次のステージ →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: '#F5C518' }]} onPress={onNext}>
            <Text style={[s.nextBtnTxt, { color: '#1A1E2E' }]}>👑 全クリア！マップへ戻る</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.nextBtn, { backgroundColor: GREY }]} onPress={onReplay}>
          <Text style={s.nextBtnTxt}>🔄 もう一度</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ── BFS Solver（ヒント用：最短解の第1手を返す）──────────────
function solveHint(tubes, cap) {
  const encode = ts => ts.map(t => t.join(',')).join('|');
  const isWon  = ts => ts.every(t => t.length === 0 || (t.length === cap && t.every(b => b === t[0])));

  // ヒューリスティック：未整列のボール数（少ないほど解に近い）
  const heuristic = ts => {
    let h = 0;
    for (const t of ts) {
      if (t.length === 0) continue;
      if (t.length === cap && t.every(b => b === t[0])) continue;
      h += t.length;
    }
    return h;
  };

  const init = tubes.map(t => [...t]);
  if (isWon(init)) return null;

  // A*風 優先度付きキュー（配列ヒープ）
  const heap = [];
  const heapPush = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const heapPop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      while (true) {
        let s = i, l = 2*i+1, r = 2*i+2;
        if (l < heap.length && heap[l].f < heap[s].f) s = l;
        if (r < heap.length && heap[r].f < heap[s].f) s = r;
        if (s === i) break;
        [heap[i], heap[s]] = [heap[s], heap[i]];
        i = s;
      }
    }
    return top;
  };

  heapPush({ state: init, first: null, g: 0, f: heuristic(init) });
  const seen = new Set([encode(init)]);
  const MAX_ITER = 50000;
  let iterations = 0;

  while (heap.length && iterations++ < MAX_ITER) {
    const { state, first, g } = heapPop();
    const N = state.length;

    for (let f = 0; f < N; f++) {
      if (!state[f].length) continue;
      const top = state[f].at(-1);
      let cnt = 1;
      while (cnt < state[f].length && state[f][state[f].length - 1 - cnt] === top) cnt++;

      for (let t = 0; t < N; t++) {
        if (t === f) continue;
        if (state[t].length + cnt > cap) continue;
        if (state[t].length && state[t].at(-1) !== top) continue;
        if (!state[t].length && state[f].every(b => b === top)) continue;

        const next = state.map(x => [...x]);
        for (let i = 0; i < cnt; i++) next[t].push(next[f].pop());

        const key = encode(next);
        if (seen.has(key)) continue;
        seen.add(key);

        const move = first ?? { from: f, to: t };
        if (isWon(next)) return move;
        const ng = g + 1;
        heapPush({ state: next, first: move, g: ng, f: ng + heuristic(next) });
      }
    }
  }
  return null;
}

// ── Deadlock Detector ──────────────────────────────────────
function isDeadlocked(tubes, cap) {
  for (let f = 0; f < tubes.length; f++) {
    if (!tubes[f].length) continue;
    const top = tubes[f].at(-1);
    for (let t = 0; t < tubes.length; t++) {
      if (t === f || tubes[t].length >= cap) continue;
      if (!tubes[t].length || tubes[t].at(-1) === top) return false;
    }
  }
  return true;
}

// ── Deadlock Modal ─────────────────────────────────────────
function DeadlockModal({ onRestart, onUndo, hasUndo }) {
  const scale = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
  }, []);
  return (
    <Modal transparent animationType="fade">
      <View style={s.overlay}>
        <Animated.View style={[s.winCard, { transform: [{ scale }], gap: 12 }]}>
          <Text style={{ fontSize: 52 }}>😵</Text>
          <Text style={[s.winTitle, { fontSize: 22, textAlign: 'center' }]}>詰みました！</Text>
          <Text style={{ fontSize: 14, color: GREY, textAlign: 'center', lineHeight: 20 }}>
            これ以上動かせません。{'\n'}やり直しましょう！
          </Text>
          {hasUndo && (
            <TouchableOpacity style={[s.nextBtn, { backgroundColor: '#2F7BF0' }]} onPress={onUndo}>
              <Text style={s.nextBtnTxt}>↩ 一手戻す</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.nextBtn, { backgroundColor: '#E84343' }]} onPress={onRestart}>
            <Text style={s.nextBtnTxt}>🔄 やり直す</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Floating Completion Badge ──────────────────────────────
function FloatingCheck({ x, y, color, onDone }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const scale      = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale,   { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]),
      Animated.delay(480),
      Animated.parallel([
        Animated.timing(translateY, { toValue: -72, duration: 580, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,   duration: 480, delay: 100, useNativeDriver: true }),
      ]),
    ]).start(onDone);
  }, []);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', zIndex: 998,
        left: x - 24, top: y - 52,
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: color,
        alignItems: 'center', justifyContent: 'center',
        transform: [{ translateY }, { scale }],
        opacity,
        shadowColor: color,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.8, shadowRadius: 14, elevation: 14,
      }}
    >
      <Text style={{ fontSize: 22, color: '#fff', fontWeight: '900' }}>✓</Text>
    </Animated.View>
  );
}

// ── Game Screen ────────────────────────────────────────────
function GameScreen({ stage, items, hearts, bgmOn, isFirstPlay, isChallenge, challengeOverride, colorblindMode, onTutorialDone, onBack, onNext, onStageComplete, onUseItem, onBuyItem, onConsumeHeart, onToggleSound, onToggleColorblind }) {
  const cfg = challengeOverride
    ? { colors: challengeOverride.colors, cap: challengeOverride.cap, empty: challengeOverride.empty, stageColor: '#8B30E8' }
    : getStageConfig(stage);
  const { colors, cap, empty, stageColor } = cfg;
  const levelSeed = challengeOverride?.seed ?? stage;

  const [tubes, setTubes]           = useState(() => makeLevel(colors, cap, empty, levelSeed));
  const [selected, setSelected]     = useState(null);
  const [moves, setMoves]           = useState(0);
  const [won, setWon]               = useState(false);
  const [history, setHistory]       = useState([]);
  const [purchaseType, setPurchaseType] = useState(null);
  const [tutorialStep, setTutorialStep] = useState(isFirstPlay ? 1 : 0);
  const [coinsEarned, setCoinsEarned]   = useState(0);
  const [deadlocked, setDeadlocked]     = useState(false);
  const restartCountRef = useRef(0);
  const glowAnims       = useRef(Array.from({ length: tubes.length }, () => new Animated.Value(0))).current;
  const [floatingChecks, setFloatingChecks] = useState([]);

  function advanceTutorial() {
    if (tutorialStep < TUTORIAL_STEPS.length) {
      setTutorialStep(s => s + 1);
    } else {
      setTutorialStep(0);
      onTutorialDone?.();
    }
  }

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
        const totalMoves = moves + 1;
        const optMoves   = colors * cap;
        const starsWon   = totalMoves <= optMoves ? 3 : totalMoves <= optMoves * 1.7 ? 2 : 1;
        const stageMult  = stage >= 151 ? 3 : stage >= 101 ? 2 : stage >= 51 ? 1.5 : 1;
        const coins      = Math.round(COIN_PER_STAR[starsWon] * stageMult * (isChallenge ? 2 : 1));
        setCoinsEarned(coins);
        setWon(true);
        onStageComplete?.(stage, coins, starsWon, isChallenge);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        playSound('win');
      } else if (isDeadlocked(nt, cap)) {
        setDeadlocked(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        playSound('error');
      } else if (justCompleted) {
        playSound(`complete${Math.min(newCompleted, 9)}`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        // Find which specific tubes just completed → trigger glow + floating badge
        const newlyDoneIdxs = nt
          .map((t, ti) => ti)
          .filter(ti => {
            const nowDone = nt[ti].length === cap && nt[ti].length > 0 && nt[ti].every(b => b === nt[ti][0]);
            const wasDone = prevTubes[ti].length === cap && prevTubes[ti].length > 0 && prevTubes[ti].every(b => b === prevTubes[ti][0]);
            return nowDone && !wasDone;
          });
        newlyDoneIdxs.forEach(ti => {
          glowAnims[ti].setValue(0);
          Animated.sequence([
            Animated.timing(glowAnims[ti], { toValue: 1,    duration: 250, useNativeDriver: true }),
            Animated.timing(glowAnims[ti], { toValue: 0.42, duration: 210, useNativeDriver: true }),
            Animated.timing(glowAnims[ti], { toValue: 0.78, duration: 180, useNativeDriver: true }),
            Animated.timing(glowAnims[ti], { toValue: 0,    duration: 920, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]).start();
          const ref = tubeViewRefs.current[ti];
          if (ref) {
            ref.measure((fx, fy, fw, fh, px, py) => {
              const color = PALETTE[nt[ti][0]];
              const key   = `check-${ti}-${Date.now()}`;
              setFloatingChecks(prev => [...prev, { key, x: px + fw / 2, y: py, color }]);
            });
          }
        });
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
          Animated.spring(fillAnim, {
            toValue: 1, friction: 3.5, tension: 180, useNativeDriver: true,
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

    // BFS で最短解の第1手を探す。見つからなければグリーディーフォールバック
    const move = solveHint(tubes, cap) ?? (() => {
      for (let f = 0; f < tubes.length; f++) {
        if (!tubes[f].length) continue;
        const top = tubes[f].at(-1);
        for (let t = 0; t < tubes.length; t++) {
          if (t === f || tubes[t].length >= cap) continue;
          if (tubes[t].length && tubes[t].at(-1) !== top) continue;
          return { from: f, to: t };
        }
      }
      return null;
    })();

    if (move) {
      const { from: f, to: t } = move;
      const top = tubes[f].at(-1);
      let cnt = 1;
      while (cnt < tubes[f].length && tubes[f][tubes[f].length - 1 - cnt] === top) cnt++;
      onUseItem('hint');
      setHistory(h => [...h, tubes.map(x => [...x])]);
      const nt = tubes.map(x => [...x]);
      for (let i = 0; i < cnt; i++) nt[t].push(nt[f].pop());
      setTubes(nt);
      setMoves(m => m + 1);
      setSelected(null);
      bounce(t);
      if (checkWin(nt)) {
        setWon(true);
        onStageComplete?.(stage);
      }
    } else {
      Alert.alert('詰まっています', '↩ Undoで戻るか、🔄 リスタートを試してください。');
    }
  }

  function restart() {
    glowAnims.forEach(a => a.setValue(0));
    setFloatingChecks([]);
    tiltAnims.forEach(a => a.setValue(0));
    moveXAnims.forEach(a => a.setValue(0));
    moveYAnims.forEach(a => a.setValue(0));
    drainAnim.setValue(0);
    fillAnim.setValue(0);
    setPourInfo(null);
    setStream(null);
    streamOpacity.setValue(0);
    setTubes(makeLevel(colors, cap, empty, levelSeed));
    setSelected(null);
    setMoves(0);
    setWon(false);
    setDeadlocked(false);
    setHistory([]);
    isAnimating.current = false;
    completedRef.current = 0;
  }

  function restartWithAd() {
    if (!isChallenge && hearts && hearts.count <= 0) {
      Alert.alert(
        'ハートがありません 💔',
        'ハートが回復するまでお待ちください。',
        [
          { text: 'ステージ選択へ', onPress: onBack },
          { text: 'キャンセル', style: 'cancel' },
        ]
      );
      return;
    }
    if (!isChallenge) onConsumeHeart?.();
    restartCountRef.current += 1;
    if (restartCountRef.current % 3 === 0) {
      showInterstitial(() => restart());
    } else {
      restart();
    }
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
          <Text style={[s.headerTitle, { color: '#E8D8A0' }]}>
            {isChallenge ? 'DAILY CHALLENGE' : `ステージ ${stage}`}
          </Text>
          {!isChallenge && empty === 1 && (
            <Text style={{ fontSize: 10, color: '#E84343', fontWeight: '800', letterSpacing: 1 }}>
              🔥 EXTREME
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity onPress={onToggleSound} style={s.miniIconBtn}>
            <Text style={{ fontSize: 16 }}>{bgmOn ? '🔊' : '🔇'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onToggleColorblind} style={s.miniIconBtn}>
            <Text style={{ fontSize: 16 }}>{colorblindMode ? '👁' : '🎨'}</Text>
          </TouchableOpacity>
        </View>
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

        <Text style={{ fontSize: 13, color: 'rgba(200,180,255,0.75)', fontWeight: '700', marginRight: 4 }}>
          {moves}手
        </Text>
        <TouchableOpacity style={[s.restartBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]} onPress={restartWithAd}>
          <Text style={s.restartBtnTxt}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Board */}
      <View style={s.board}>
        {rowData.map((row, ri) => (
          <View key={ri} style={s.tubeRow}>
            {row.map(i => {
              const tubeBaseColor = tubes[i].length > 0 ? PALETTE[tubes[i][0]] : '#fff';
              return (
                <View key={i} style={{ alignItems: 'center' }}>
                  {/* Completion glow aura — animates via glowAnims[i] */}
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: -8, left: -14, right: -14, bottom: -8,
                      borderRadius: (tubeW + 28) / 2,
                      backgroundColor: tubeBaseColor,
                      opacity: glowAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0, 0.52] }),
                      transform: [{ scale: glowAnims[i].interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.14, 1.06] }) }],
                    }}
                  />
                  <Animated.View style={{
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
                        colorblindMode={colorblindMode}
                      />
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {tutorialStep > 0 && (
        <TutorialOverlay
          step={tutorialStep}
          onNext={advanceTutorial}
          onSkip={() => { setTutorialStep(0); onTutorialDone?.(); }}
        />
      )}

      {won && (
        <WinOverlay
          moves={moves} stage={stage} stageColor={stageColor}
          coinsEarned={coinsEarned}
          onNext={onNext} onReplay={restart}
        />
      )}

      {deadlocked && !won && (
        <DeadlockModal
          hasUndo={history.length > 0}
          onUndo={() => { setDeadlocked(false); handleUndo(); }}
          onRestart={restartWithAd}
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

      {/* Floating completion badges */}
      {floatingChecks.map(fc => (
        <FloatingCheck
          key={fc.key}
          x={fc.x}
          y={fc.y}
          color={fc.color}
          onDone={() => setFloatingChecks(prev => prev.filter(c => c.key !== fc.key))}
        />
      ))}
      </SafeAreaView>
    </ImageBackground>
  );
}

// ── Stage Map Layout ───────────────────────────────────────
const MAP_STEP     = 96;
const MAP_PIPE_X   = SW / 2;
const MAP_CARD_W   = Math.min(158, Math.floor((SW - 80) / 2));
const MAP_CONN_W   = Math.max(8,  Math.floor(SW / 2 - 15 - MAP_CARD_W));
const TOTAL_STAGES = 200;

function buildMapLayout() {
  const items = [], yPos = {};
  let y = 0;
  for (let num = TOTAL_STAGES; num >= 1; num--) {
    const side = (TOTAL_STAGES - num) % 2 === 0 ? 'right' : 'left';
    yPos[num] = y;
    items.push({ type: 'stage', num, y, h: MAP_STEP, side });
    y += MAP_STEP;
  }
  return { items, yPos, totalH: y };
}
const MAP_LAYOUT = buildMapLayout();

// ── Stage Map Node ─────────────────────────────────────────
function StageMapNode({ num, side, isCleared, isCurrent, isLocked, stars, bandColor, onPress, animIndex }) {
  const scale    = useRef(new Animated.Value(1)).current;
  const slideX   = useRef(new Animated.Value(side === 'left' ? -70 : 70)).current;
  const mountOp  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = Math.min((animIndex ?? 0) * 30, 600);
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(slideX,  { toValue: 0, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(mountOp, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  function handlePress() {
    if (isLocked) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.91, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start(() => onPress());
  }
  const DOT_R    = isCurrent ? 16 : 11;
  const cardLeft = side === 'left' ? 12 : SW - 12 - MAP_CARD_W;
  const connLeft = side === 'left' ? 12 + MAP_CARD_W : MAP_PIPE_X + 3;
  return (
    <View style={{ height: MAP_STEP, width: '100%' }}>
      {/* Connector card→pipe */}
      <View style={{
        position: 'absolute', left: connLeft,
        top: MAP_STEP / 2 - 1.5, width: MAP_CONN_W, height: 3, borderRadius: 2,
        backgroundColor: isCleared ? `${bandColor}70` : isCurrent ? `${bandColor}55` : 'rgba(255,255,255,0.09)',
      }} />
      {/* Pipe dot */}
      <View style={{
        position: 'absolute',
        left: MAP_PIPE_X - DOT_R, top: MAP_STEP / 2 - DOT_R,
        width: DOT_R * 2, height: DOT_R * 2, borderRadius: DOT_R,
        backgroundColor: isCurrent ? bandColor : isCleared ? '#5A18B0' : 'rgba(18,8,45,0.96)',
        borderWidth: isCurrent ? 3 : 1.5,
        borderColor: isCurrent ? 'rgba(255,240,180,0.9)' : isCleared ? `${bandColor}80` : 'rgba(255,255,255,0.13)',
        zIndex: 5, alignItems: 'center', justifyContent: 'center',
        shadowColor: isCurrent ? bandColor : 'transparent',
        shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 12, elevation: 10,
      }}>
        {isCurrent && <Text style={{ fontSize: 9, fontWeight: '900', color: '#fff' }}>{num}</Text>}
      </View>
      {/* Stage card */}
      <Animated.View style={{
        position: 'absolute', left: cardLeft,
        top: MAP_STEP / 2 - 29, width: MAP_CARD_W, height: 58,
        opacity: mountOp,
        transform: [{ scale }, { translateX: slideX }],
      }}>
        <TouchableOpacity onPress={handlePress} activeOpacity={0.82} style={{
          flex: 1, borderRadius: 16,
          backgroundColor: isCurrent ? bandColor : isCleared ? `${bandColor}28` : 'rgba(255,255,255,0.04)',
          borderWidth: 1.5,
          borderColor: isCurrent ? 'rgba(255,240,180,0.65)' : isCleared ? `${bandColor}66` : 'rgba(255,255,255,0.06)',
          alignItems: 'center', justifyContent: 'center',
          shadowColor: isCurrent ? bandColor : 'transparent',
          shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.8, shadowRadius: 14, elevation: isCurrent ? 14 : 0,
          opacity: isLocked ? 0.32 : 1,
        }}>
          {isLocked ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 18, lineHeight: 22 }}>🔒</Text>
              <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{num}</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: isCurrent ? '#fff' : '#E8D8A0', lineHeight: 28 }}>
                {num}
              </Text>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {[1,2,3].map(s => (
                  <Text key={s} style={{ fontSize: 9, color: s <= stars ? '#F5C518' : 'rgba(255,255,255,0.13)' }}>★</Text>
                ))}
              </View>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ── Stage Select Screen ────────────────────────────────────
const HEART_COIN_COST  = 30;
const REFILL_COIN_COST = 100;

function StageSelect({ clearedStages, stageStars, hearts, coins, challengeDone, weekly, onPlay, onPlayChallenge, onAddHearts, onSpendCoins, onShowMissions, onShowSettings, onShowAchievements }) {
  const nextStage = Math.min(TOTAL_STAGES + 1, clearedStages.size > 0 ? Math.max(...clearedStages) + 1 : 1);
  const [shopOpen, setShopOpen] = useState(false);
  const [noHearts, setNoHearts] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const scrollRef = useRef(null);
  const challenge = getDailyChallengeConfig();

  useEffect(() => {
    if (hearts.count >= MAX_HEARTS || !hearts.nextRegenAt) { setTimeLeft(''); return; }
    const tick = () => {
      const ms = hearts.nextRegenAt - Date.now();
      if (ms <= 0) { setTimeLeft(''); return; }
      const m = Math.floor(ms / 60000), sec = Math.floor((ms % 60000) / 1000);
      setTimeLeft(`${m}:${String(sec).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hearts]);

  // Auto-scroll to current stage on mount
  useEffect(() => {
    const stageY = MAP_LAYOUT.yPos[Math.min(nextStage, TOTAL_STAGES)] ?? 0;
    const targetY = stageY + MAP_STEP / 2 - SH * 0.44;
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, targetY), animated: false }), 80);
  }, []);

  function handleCellPress(num) {
    if (hearts.count <= 0) { setNoHearts(true); return; }
    onPlay(num);
  }

  const iconBtn = {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(200,160,80,0.4)',
  };

  return (
    <ImageBackground source={require('./assets/background.png')} style={{ flex: 1 }} resizeMode="cover">
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,2,14,0.42)' }} />
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />

        {/* ── Top bar ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 14, paddingVertical: 10,
          backgroundColor: 'rgba(10,6,30,0.78)',
          borderBottomWidth: 1, borderBottomColor: 'rgba(180,140,55,0.3)',
        }}>
          <View style={{ alignItems: 'center', minWidth: 48 }}>
            <Text style={{ fontSize: 10, color: 'rgba(200,180,255,0.6)', letterSpacing: 2, fontWeight: '700' }}>STAGE</Text>
            <Text style={{ fontSize: 16, fontWeight: '900', color: '#E8D8A0' }}>
              {Math.min(nextStage, TOTAL_STAGES)}<Text style={{ fontSize: 10, color: 'rgba(200,180,255,0.5)' }}>/{TOTAL_STAGES}</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: 'rgba(245,197,24,0.15)', paddingHorizontal: 10, paddingVertical: 5,
            borderRadius: 14, borderWidth: 1, borderColor: 'rgba(245,197,24,0.35)' }}>
            <Text style={{ fontSize: 14 }}>🪙</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: '#F5C518' }}>{coins}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', gap: 2 }}>
              {Array.from({ length: MAX_HEARTS }, (_, i) => (
                <Text key={i} style={{ fontSize: 16 }}>{i < hearts.count ? '❤️' : '🖤'}</Text>
              ))}
            </View>
            {timeLeft ? (
              <Text style={{ fontSize: 10, color: '#F5C518', fontWeight: '700', marginTop: 1 }}>+❤️ {timeLeft}</Text>
            ) : hearts.count >= MAX_HEARTS ? (
              <Text style={{ fontSize: 9, color: 'rgba(200,180,255,0.5)', marginTop: 1 }}>MAX</Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={onShowAchievements} style={iconBtn}><Text style={{ fontSize: 16 }}>🏆</Text></TouchableOpacity>
          <TouchableOpacity onPress={onShowSettings}     style={iconBtn}><Text style={{ fontSize: 16 }}>⚙️</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setShopOpen(true)} style={iconBtn}><Text style={{ fontSize: 18 }}>🏪</Text></TouchableOpacity>
        </View>

        {/* ── Vertical stage map ── */}
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

          {/* Title */}
          <View style={{ alignItems: 'center', paddingVertical: 16 }}>
            <Text style={{ fontSize: 28, fontWeight: '900', letterSpacing: 4, color: '#E8D08A',
              textShadowColor: 'rgba(200,100,255,0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 16 }}>
              POTION SORT
            </Text>
            <Text style={{ fontSize: 10, color: 'rgba(200,180,255,0.6)', letterSpacing: 3, marginTop: 3 }}>✦ LIQUID PUZZLE ✦</Text>
            {clearedStages.size > 0 && (
              <Text style={{ fontSize: 11, color: 'rgba(220,200,255,0.5)', marginTop: 6 }}>
                {clearedStages.size} / {TOTAL_STAGES} ステージクリア
              </Text>
            )}
            {nextStage > TOTAL_STAGES && (
              <View style={{
                marginTop: 10, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
                backgroundColor: 'rgba(245,197,24,0.15)', borderWidth: 1.5, borderColor: 'rgba(245,197,24,0.5)',
              }}>
                <Text style={{ fontSize: 13, fontWeight: '900', color: '#F5C518', textAlign: 'center', letterSpacing: 1 }}>
                  👑 全200ステージ完全制覇！
                </Text>
                <Text style={{ fontSize: 10, color: 'rgba(220,200,180,0.7)', textAlign: 'center', marginTop: 2 }}>
                  あなたは真の錬金術師です
                </Text>
              </View>
            )}
          </View>

          {/* Map with central pipe */}
          <View style={{ position: 'relative' }}>
            {/* Central pipe */}
            <View style={{
              position: 'absolute', left: MAP_PIPE_X - 4, top: 0, bottom: 0, width: 8,
              backgroundColor: '#3A1272', overflow: 'hidden',
            }}>
              <View style={{ position: 'absolute', left: 1, top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(180,120,255,0.30)' }} />
              <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(0,0,0,0.38)' }} />
            </View>

            {MAP_LAYOUT.items.map((item, idx) => {
              const { num, side } = item;
              const band      = BANDS[Math.min(Math.floor((num - 1) / 10), BANDS.length - 1)];
              const isCleared = clearedStages.has(num);
              const isCurrent = num === nextStage;
              const isLocked  = num > nextStage;
              return (
                <StageMapNode
                  key={num}
                  num={num}
                  side={side}
                  isCleared={isCleared}
                  isCurrent={isCurrent}
                  isLocked={isLocked}
                  stars={stageStars[num] ?? 0}
                  bandColor={band.color}
                  onPress={() => handleCellPress(num)}
                  animIndex={idx}
                />
              );
            })}
          </View>

          {/* ── Special modes (bottom of map) ── */}
          <View style={{ paddingHorizontal: 20, paddingTop: 28, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.10)' }} />
              <Text style={{ fontSize: 10, color: 'rgba(200,180,255,0.5)', letterSpacing: 2, fontWeight: '700' }}>SPECIAL</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.10)' }} />
            </View>

            <TouchableOpacity
              onPress={() => { if (hearts.count <= 0) { setNoHearts(true); return; } onPlayChallenge(challenge); }}
              activeOpacity={0.82}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                paddingVertical: 14, borderRadius: 28,
                backgroundColor: challengeDone ? 'rgba(39,199,87,0.18)' : 'rgba(20,10,50,0.85)',
                borderWidth: 1.5, borderColor: challengeDone ? '#27C757' : 'rgba(245,197,24,0.55)',
                shadowColor: challengeDone ? '#27C757' : '#F5C518',
                shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
              }}
            >
              <Text style={{ fontSize: 22 }}>{challengeDone ? '✅' : '🧪'}</Text>
              <View>
                <Text style={{ color: challengeDone ? '#27C757' : '#F5C518', fontSize: 13, fontWeight: '800', letterSpacing: 1 }}>
                  {challengeDone ? "TODAY'S CHALLENGE DONE!" : "TODAY'S CHALLENGE"}
                </Text>
                <Text style={{ color: 'rgba(200,180,255,0.7)', fontSize: 11, marginTop: 1 }}>
                  {challengeDone ? 'また明日！' : 'クリアで🪙×2ボーナス！'}
                </Text>
              </View>
            </TouchableOpacity>

            {(() => {
              const claimable = weekly && WEEKLY_MISSIONS.some(m => {
                const p = weekly.progress[m.id];
                return p && p.current >= m.target && !p.claimed;
              });
              return (
                <TouchableOpacity onPress={onShowMissions} activeOpacity={0.82} style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                  paddingVertical: 12, borderRadius: 24,
                  backgroundColor: claimable ? 'rgba(245,197,24,0.18)' : 'rgba(20,10,50,0.75)',
                  borderWidth: 1.5, borderColor: claimable ? '#F5C518' : 'rgba(100,100,180,0.4)',
                }}>
                  <Text style={{ fontSize: 20 }}>📋</Text>
                  <View>
                    <Text style={{ color: claimable ? '#F5C518' : '#E8D8A0', fontSize: 13, fontWeight: '800', letterSpacing: 1 }}>
                      WEEKLY MISSIONS
                    </Text>
                    <Text style={{ color: 'rgba(200,180,255,0.65)', fontSize: 11, marginTop: 1 }}>
                      {claimable ? '🎁 報酬が受け取れます！' : `${WEEKLY_MISSIONS.filter(m => weekly?.progress[m.id]?.claimed).length}/${WEEKLY_MISSIONS.length} 達成`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })()}
          </View>
        </ScrollView>

        {/* ── Banner Ad ── */}
        <View style={{ alignItems: 'center' }}>
          <BannerAd unitId={AD_IDS.banner} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={{ requestNonPersonalizedAdsOnly: true }} />
        </View>

        {/* ── Heart Shop modal ── */}
        {(shopOpen || noHearts) && (
          <Modal transparent animationType="fade">
            <View style={s.overlay}>
              <View style={[s.winCard, { gap: 10 }]}>
                <Text style={{ fontSize: 44 }}>{noHearts ? '💔' : '🏪'}</Text>
                <Text style={[s.winTitle, { fontSize: 22 }]}>{noHearts ? 'ハートがありません' : 'ハートショップ'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: 'rgba(245,197,24,0.12)', paddingHorizontal: 16, paddingVertical: 8,
                  borderRadius: 16, borderWidth: 1, borderColor: 'rgba(245,197,24,0.35)' }}>
                  <Text style={{ fontSize: 18 }}>🪙</Text>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#F5C518' }}>{coins} コイン</Text>
                </View>
                <TouchableOpacity
                  style={[s.nextBtn, { backgroundColor: coins >= HEART_COIN_COST ? '#8B30E8' : '#AAA' }]}
                  onPress={() => { if (coins < HEART_COIN_COST) return; onSpendCoins(HEART_COIN_COST); onAddHearts(1); setShopOpen(false); setNoHearts(false); }}
                  disabled={coins < HEART_COIN_COST}>
                  <Text style={s.nextBtnTxt}>🪙 {HEART_COIN_COST}コイン → ❤️ × 1</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.nextBtn, { backgroundColor: coins >= REFILL_COIN_COST ? '#2F7BF0' : '#AAA' }]}
                  onPress={() => { if (coins < REFILL_COIN_COST || hearts.count >= MAX_HEARTS) return; onSpendCoins(REFILL_COIN_COST); onAddHearts(MAX_HEARTS - hearts.count); setShopOpen(false); setNoHearts(false); }}
                  disabled={coins < REFILL_COIN_COST || hearts.count >= MAX_HEARTS}>
                  <Text style={s.nextBtnTxt}>🪙 {REFILL_COIN_COST}コイン → ❤️ 全回復</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.nextBtn, { backgroundColor: '#E84343' }]}
                  onPress={() => { setNoHearts(false); setShopOpen(false); showRewarded(() => onAddHearts(3)); }}>
                  <Text style={s.nextBtnTxt}>📺 広告を見て❤️ × 3もらう</Text>
                </TouchableOpacity>
                <View style={{ width: '100%', height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 4 }} />
                <Text style={{ fontSize: 11, color: GREY, fontWeight: '700', letterSpacing: 1 }}>💎 コインを購入</Text>
                {COIN_PACKS.map(pack => (
                  <TouchableOpacity key={pack.id}
                    style={[s.nextBtn, { backgroundColor: '#4A5AAD', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                    onPress={() => Alert.alert('💎 コイン購入', `${pack.label} で 🪙×${pack.coins} を購入しますか？\n\n※ Google Play Console で商品を設定後にご利用いただけます。`, [{ text: 'OK' }])}>
                    <Text style={s.nextBtnTxt}>{pack.emoji} 🪙×{pack.coins}</Text>
                    {pack.badge && <Text style={{ fontSize: 10, color: '#F5C518', fontWeight: '800', marginRight: 4 }}>{pack.badge}</Text>}
                    <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '700' }}>{pack.label}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[s.nextBtn, { backgroundColor: GREY }]}
                  onPress={() => { setNoHearts(false); setShopOpen(false); }}>
                  <Text style={s.nextBtnTxt}>閉じる</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
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
  const [tutorialDone, setTutorialDone]   = useState(true);
  const [hearts, setHearts]               = useState({ count: MAX_HEARTS, nextRegenAt: null });
  const [coins, setCoins]                 = useState(0);
  const [dailyBonus, setDailyBonus]       = useState(null);
  const [showReview, setShowReview]       = useState(false);
  const [earnedAchieves, setEarnedAchieves] = useState(new Set());
  const [toastQueue, setToastQueue]       = useState([]);
  const [challengeDone, setChallengeDone] = useState(false);
  const [weekly, setWeekly]               = useState(initWeeklyProgress);
  const [showMissions, setShowMissions]   = useState(false);
  const [bgmOn, setBgmOn]                 = useState(true);
  const [colorblind, setColorblind]       = useState(false);
  const [showSettings, setShowSettings]   = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [stageStars, setStageStars]       = useState({});

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      AsyncStorage.getItem(PROGRESS_KEY),
      AsyncStorage.getItem(ITEMS_KEY),
      AsyncStorage.getItem(TUTORIAL_KEY),
      AsyncStorage.getItem(HEARTS_KEY),
      AsyncStorage.getItem(COINS_KEY),
      AsyncStorage.getItem(DAILY_KEY),
      AsyncStorage.getItem(REVIEW_KEY),
      AsyncStorage.getItem(ACHIEVE_KEY),
      AsyncStorage.getItem(CHALLENGE_KEY),
      AsyncStorage.getItem(WEEKLY_KEY),
      AsyncStorage.getItem(BGM_KEY),
      AsyncStorage.getItem(COLORBLIND_KEY),
      AsyncStorage.getItem(STARS_KEY),
    ]).then(([rawP, rawI, rawT, rawH, rawC, rawD, rawR, rawA, rawCh, rawW, rawBgm, rawCb, rawSt]) => {
      if (rawP) setClearedStages(new Set(JSON.parse(rawP)));
      if (rawI) setItems(JSON.parse(rawI));
      if (!rawT) setTutorialDone(false);
      if (rawC) setCoins(Number(rawC));
      if (rawH) {
        let { count, nextRegenAt } = JSON.parse(rawH);
        const now = Date.now();
        while (count < MAX_HEARTS && nextRegenAt && now >= nextRegenAt) {
          count++;
          nextRegenAt = count < MAX_HEARTS ? nextRegenAt + HEART_REGEN_MS : null;
        }
        setHearts({ count, nextRegenAt });
        AsyncStorage.setItem(HEARTS_KEY, JSON.stringify({ count, nextRegenAt })).catch(() => {});
      }
      // デイリーボーナスチェック
      const daily = rawD ? JSON.parse(rawD) : { lastDate: null, streak: 0 };
      if (daily.lastDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const newStreak = daily.lastDate === yesterday ? Math.min(daily.streak + 1, 7) : 1;
        const reward    = DAILY_REWARDS[newStreak - 1];
        setDailyBonus({ streak: newStreak, reward });
      }
      // 実績ロード
      if (rawA) setEarnedAchieves(new Set(JSON.parse(rawA)));
      // チャレンジ完了チェック
      if (rawCh) {
        const ch = JSON.parse(rawCh);
        if (ch.date === today) setChallengeDone(true);
      }
      // ウィークリーミッション読み込み（週が変わったらリセット）
      const thisWeek = getWeekKey();
      if (rawW) {
        const w = JSON.parse(rawW);
        setWeekly(w.weekKey === thisWeek ? w : initWeeklyProgress());
      }
      // BGM設定
      const bgmSaved = rawBgm !== null ? rawBgm === '1' : true;
      setBgmOn(bgmSaved);
      setBGMEnabled(bgmSaved);
      if (rawCb === '1') setColorblind(true);
      if (rawSt) setStageStars(JSON.parse(rawSt));
    }).catch(() => {});
    initSounds().then(() => playBGM());
    loadRewarded();
    loadInterstitial();
    requestNotificationPermission().then(granted => {
      if (granted) scheduleDailyReminder();
    });
  }, []);

  function claimDailyBonus() {
    if (!dailyBonus) return;
    const today = new Date().toISOString().slice(0, 10);
    AsyncStorage.setItem(DAILY_KEY, JSON.stringify({ lastDate: today, streak: dailyBonus.streak })).catch(() => {});
    setCoins(prev => {
      const next = prev + dailyBonus.reward.coins;
      AsyncStorage.setItem(COINS_KEY, String(next)).catch(() => {});
      return next;
    });
    if (dailyBonus.reward.hearts > 0) addHearts(dailyBonus.reward.hearts);
    if (dailyBonus.streak >= 7) unlockAchievement('daily_7');
    setDailyBonus(null);
  }

  function unlockAchievement(id) {
    setEarnedAchieves(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(ACHIEVE_KEY, JSON.stringify([...next])).catch(() => {});
      const achievement = ACHIEVEMENTS.find(a => a.id === id);
      if (achievement) setToastQueue(q => [...q, achievement]);
      return next;
    });
  }

  function checkAchievements(clearedSet, stars, isChallenge, streak) {
    if (clearedSet.size >= 1)   unlockAchievement('first_clear');
    if (clearedSet.size >= 5)   unlockAchievement('clear_5');
    if (clearedSet.size >= 10)  unlockAchievement('clear_10');
    if (clearedSet.size >= 30)  unlockAchievement('clear_30');
    if (clearedSet.size >= 50)  unlockAchievement('clear_50');
    if (clearedSet.size >= 100) unlockAchievement('clear_100');
    if (clearedSet.size >= 150) unlockAchievement('clear_150');
    if (clearedSet.size >= 200) unlockAchievement('clear_200');
    if (stars === 3)           unlockAchievement('perfect');
    if (isChallenge)           unlockAchievement('challenge');
    if (streak >= 7)           unlockAchievement('daily_7');
  }

  function saveHearts(h) {
    AsyncStorage.setItem(HEARTS_KEY, JSON.stringify(h)).catch(() => {});
  }

  function consumeHeart() {
    setHearts(prev => {
      const count = Math.max(0, prev.count - 1);
      const nextRegenAt = prev.nextRegenAt ?? (count < MAX_HEARTS ? Date.now() + HEART_REGEN_MS : null);
      const next = { count, nextRegenAt };
      saveHearts(next);
      scheduleHeartFullNotification(nextRegenAt, count, MAX_HEARTS);
      return next;
    });
  }

  function addHearts(n) {
    setHearts(prev => {
      const count = Math.min(MAX_HEARTS, prev.count + n);
      const nextRegenAt = count >= MAX_HEARTS ? null : prev.nextRegenAt ?? Date.now() + HEART_REGEN_MS;
      const next = { count, nextRegenAt };
      saveHearts(next);
      scheduleHeartFullNotification(nextRegenAt, count, MAX_HEARTS);
      return next;
    });
  }

  function handleTutorialDone() {
    setTutorialDone(true);
    AsyncStorage.setItem(TUTORIAL_KEY, '1').catch(() => {});
  }

  function saveProgress(set) {
    AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify([...set])).catch(() => {});
  }

  function saveItems(obj) {
    AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(obj)).catch(() => {});
  }

  function handleStageComplete(stageNum, coinsWon = 0, stars = 1, isChallenge = false) {
    setCoins(prev => {
      const next = prev + coinsWon;
      AsyncStorage.setItem(COINS_KEY, String(next)).catch(() => {});
      return next;
    });
    if (!isChallenge && stageNum > 0) {
      setStageStars(prev => {
        if ((prev[stageNum] ?? 0) >= stars) return prev;
        const next = { ...prev, [stageNum]: stars };
        AsyncStorage.setItem(STARS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    }
    if (stageNum === REVIEW_STAGE) {
      AsyncStorage.getItem(REVIEW_KEY).then(raw => {
        if (!raw) setShowReview(true);
      }).catch(() => {});
    }
    const MILESTONES = {
      50:  { title: '🏆 ステージ50クリア！', msg: 'cap-6チャレンジ開幕！さらに深みへ...' },
      100: { title: '🌟 ステージ100クリア！', msg: '伝説のポーション使いへの道が開かれた！' },
      150: { title: '💎 ステージ150クリア！', msg: '究極の挑戦者！残るは最後の50ステージ。' },
      200: { title: '👑 ステージ200クリア！', msg: '全200ステージ完全制覇！あなたは真の錬金術師！' },
    };
    if (!isChallenge && MILESTONES[stageNum]) {
      const { title, msg } = MILESTONES[stageNum];
      setTimeout(() => Alert.alert(title, msg, [{ text: 'OK' }]), 800);
    }
    updateWeeklyProgress(stars, isChallenge);
    setClearedStages(prev => {
      const next = new Set(prev);
      next.add(stageNum);
      saveProgress(next);
      checkAchievements(next, stars, isChallenge, dailyBonus?.streak ?? 0);
      return next;
    });
  }

  function updateWeeklyProgress(stars, isChallenge) {
    setWeekly(prev => {
      const thisWeek = getWeekKey();
      const base = prev.weekKey === thisWeek ? prev : initWeeklyProgress();
      const p = { ...base.progress };
      // クリア数カウント
      p['w_clear3']    = { ...p['w_clear3'],    current: p['w_clear3'].current + 1 };
      p['w_clear7']    = { ...p['w_clear7'],    current: p['w_clear7'].current + 1 };
      // 3つ星カウント
      if (stars === 3) p['w_perfect3'] = { ...p['w_perfect3'], current: p['w_perfect3'].current + 1 };
      // チャレンジカウント
      if (isChallenge) p['w_challenge'] = { ...p['w_challenge'], current: p['w_challenge'].current + 1 };
      const next = { weekKey: thisWeek, progress: p };
      AsyncStorage.setItem(WEEKLY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  function claimWeeklyReward(missionId, reward) {
    setWeekly(prev => {
      const p = { ...prev.progress, [missionId]: { ...prev.progress[missionId], claimed: true } };
      const next = { ...prev, progress: p };
      AsyncStorage.setItem(WEEKLY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    setCoins(prev => {
      const next = prev + reward;
      AsyncStorage.setItem(COINS_KEY, String(next)).catch(() => {});
      return next;
    });
  }

  function toggleBGM() {
    const next = !bgmOn;
    setBgmOn(next);
    setBGMEnabled(next);
    AsyncStorage.setItem(BGM_KEY, next ? '1' : '0').catch(() => {});
  }

  function toggleColorblind() {
    const next = !colorblind;
    setColorblind(next);
    AsyncStorage.setItem(COLORBLIND_KEY, next ? '1' : '0').catch(() => {});
  }

  function handleSpendCoins(amount) {
    setCoins(prev => {
      const next = Math.max(0, prev - amount);
      AsyncStorage.setItem(COINS_KEY, String(next)).catch(() => {});
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
      showRewarded(() => {
        setItems(prev => {
          const next = { ...prev, [type]: prev[type] + count };
          saveItems(next);
          return next;
        });
      });
    }
  }

  const [challengeConfig, setChallengeConfig] = useState(null);

  function handlePlayChallenge(config) {
    consumeHeart();
    setChallengeConfig(config);
    setScreen('game');
  }

  function handleChallengeComplete(coinsWon, stars) {
    const today = new Date().toISOString().slice(0, 10);
    AsyncStorage.setItem(CHALLENGE_KEY, JSON.stringify({ date: today })).catch(() => {});
    setChallengeDone(true);
    handleStageComplete(0, coinsWon, stars, true);
  }

  if (screen === 'game') {
    const isChallenge = !!challengeConfig;
    const gameStage   = isChallenge ? 0 : stage;
    const gameCfg     = isChallenge ? challengeConfig : null;
    return (
      <GameScreen
        key={isChallenge ? 'challenge' : stage}
        stage={gameStage}
        challengeOverride={gameCfg}
        items={items}
        isFirstPlay={!tutorialDone && stage === 1}
        isChallenge={isChallenge}
        colorblindMode={colorblind}
        onTutorialDone={handleTutorialDone}
        onBack={() => { setChallengeConfig(null); setScreen('stages'); }}
        onNext={() => { setChallengeConfig(null); setScreen('stages'); }}
        onStageComplete={isChallenge
          ? (_, coins, stars) => handleChallengeComplete(coins, stars)
          : handleStageComplete}
        onUseItem={handleUseItem}
        onBuyItem={handleBuyItem}
        hearts={hearts}
        onConsumeHeart={consumeHeart}
        bgmOn={bgmOn}
        onToggleSound={toggleBGM}
        onToggleColorblind={toggleColorblind}
      />
    );
  }

  return (
    <>
      <StageSelect
        clearedStages={clearedStages}
        stageStars={stageStars}
        hearts={hearts}
        coins={coins}
        challengeDone={challengeDone}
        weekly={weekly}
        onPlayChallenge={handlePlayChallenge}
        onAddHearts={addHearts}
        onSpendCoins={handleSpendCoins}
        onShowMissions={() => setShowMissions(true)}
        onShowSettings={() => setShowSettings(true)}
        onShowAchievements={() => setShowAchievements(true)}
        onPlay={stageNum => { consumeHeart(); setStage(stageNum); setScreen('game'); }}
      />
      {dailyBonus && (
        <DailyBonusModal
          streak={dailyBonus.streak}
          reward={dailyBonus.reward}
          onClaim={claimDailyBonus}
        />
      )}
      {showReview && !dailyBonus && (
        <ReviewModal
          onRate={() => {
            AsyncStorage.setItem(REVIEW_KEY, 'rated').catch(() => {});
            setShowReview(false);
            StoreReview.requestReview().catch(() => {});
          }}
          onLater={() => setShowReview(false)}
          onNo={() => {
            AsyncStorage.setItem(REVIEW_KEY, 'declined').catch(() => {});
            setShowReview(false);
          }}
        />
      )}
      {showMissions && (
        <WeeklyMissionsModal
          weekly={weekly}
          coins={coins}
          onClaim={(id, reward) => claimWeeklyReward(id, reward)}
          onClose={() => setShowMissions(false)}
        />
      )}
      {showSettings && (
        <SettingsModal
          bgmOn={bgmOn}
          colorblind={colorblind}
          onToggleBGM={toggleBGM}
          onToggleColorblind={toggleColorblind}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showAchievements && (
        <AchievementListModal
          earnedAchieves={earnedAchieves}
          onClose={() => setShowAchievements(false)}
        />
      )}
      {toastQueue.length > 0 && (
        <AchievementToast
          achievement={toastQueue[0]}
          onDone={() => setToastQueue(q => q.slice(1))}
        />
      )}
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: BG },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E4E6F0' },
  iconBtn:       { padding: 8, minWidth: 44, alignItems: 'center' },
  miniIconBtn:   { padding: 6, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.10)' },
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
