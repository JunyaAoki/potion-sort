import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Dimensions, SafeAreaView, StatusBar, Animated, Easing, Modal,
  ImageBackground,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { initSounds, playSound } from './sounds';
import { loadRewarded, showRewarded, loadInterstitial, showInterstitial } from './ads';
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

// ── Achievements ───────────────────────────────────────────
const ACHIEVEMENTS = [
  { id: 'first_clear',  emoji: '🎉', title: '初クリア',        desc: '初めてステージをクリア' },
  { id: 'clear_5',      emoji: '🌱', title: '5ステージ制覇',   desc: '5ステージをクリア' },
  { id: 'clear_10',     emoji: '🏅', title: '10ステージ制覇',  desc: '10ステージをクリア' },
  { id: 'clear_30',     emoji: '🏆', title: '30ステージ制覇',  desc: '30ステージをクリア' },
  { id: 'clear_50',     emoji: '👑', title: '全ステージ制覇',  desc: '全50ステージをクリア' },
  { id: 'perfect',      emoji: '⭐', title: '完璧攻略',        desc: '3つ星でクリア' },
  { id: 'daily_7',      emoji: '🔥', title: '7日連続ログイン', desc: '7日間連続でログイン' },
  { id: 'challenge',    emoji: '🧪', title: 'チャレンジャー',  desc: 'デイリーチャレンジをクリア' },
];

function getDailyChallengeConfig() {
  const today = new Date().toISOString().slice(0, 10);
  const seed  = today.split('-').reduce((acc, n) => acc * 31 + parseInt(n), 1);
  return { colors: 6, cap: 4, empty: 2, seed, dateStr: today };
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

// ── Win Overlay ────────────────────────────────────────────
const SPARKLE_EMOJIS = ['⭐','✨','💫','🌟','⚡','💛','🔆','🌠'];

function WinOverlay({ moves, stage, stageColor, coinsEarned, onNext, onReplay }) {
  const cfg      = getStageConfig(stage);
  const optMoves = cfg.colors * 4;
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

    return () => coinAnim.removeListener(id);
  }, []);

  return (
    <View style={s.overlay}>
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

// ── Game Screen ────────────────────────────────────────────
function GameScreen({ stage, items, isFirstPlay, isChallenge, challengeOverride, onTutorialDone, onBack, onNext, onStageComplete, onUseItem, onBuyItem }) {
  const cfg = challengeOverride
    ? { colors: challengeOverride.colors, cap: challengeOverride.cap, empty: challengeOverride.empty, stageColor: '#8B30E8', bandName: 'DAILY' }
    : getStageConfig(stage);
  const { colors, cap, empty, stageColor, bandName } = cfg;
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
        const optMoves   = colors * 4;
        const starsWon   = totalMoves <= optMoves ? 3 : totalMoves <= optMoves * 1.7 ? 2 : 1;
        const coins      = COIN_PER_STAR[starsWon] * (isChallenge ? 2 : 1);
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

        <TouchableOpacity style={[s.restartBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]} onPress={restartWithAd}>
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
      </SafeAreaView>
    </ImageBackground>
  );
}

// ── Stage Select Screen ────────────────────────────────────
const TOTAL_STAGES = 50;

const HEART_COIN_COST  = 30;   // 1 heart
const REFILL_COIN_COST = 100;  // full refill

function StageSelect({ clearedStages, hearts, coins, challengeDone, onPlay, onPlayChallenge, onAddHearts, onSpendCoins }) {
  const nextStage  = clearedStages.size > 0 ? Math.max(...clearedStages) + 1 : 1;
  const cfg        = getStageConfig(nextStage);
  const [timeLeft, setTimeLeft] = useState('');
  const [shopOpen, setShopOpen] = useState(false);
  const [noHearts, setNoHearts] = useState(false);
  const btnScale   = useRef(new Animated.Value(1)).current;
  const challenge  = getDailyChallengeConfig();

  function buyHeart(count, coinCost) {
    if (coins < coinCost) return;
    onSpendCoins(coinCost);
    onAddHearts(count);
    setShopOpen(false);
    setNoHearts(false);
  }

  useEffect(() => {
    if (hearts.count >= MAX_HEARTS || !hearts.nextRegenAt) { setTimeLeft(''); return; }
    const tick = () => {
      const ms = hearts.nextRegenAt - Date.now();
      if (ms <= 0) { setTimeLeft(''); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setTimeLeft(`${m}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hearts]);

  function handlePlay() {
    if (hearts.count <= 0) { setNoHearts(true); return; }
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.93, duration: 90, useNativeDriver: true }),
      Animated.spring(btnScale,  { toValue: 1,   friction: 4,  useNativeDriver: true }),
    ]).start(() => onPlay(nextStage));
  }

  return (
    <ImageBackground source={require('./assets/background.png')} style={{ flex: 1 }} resizeMode="cover">
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,2,14,0.38)' }} />
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />

        {/* ── Top bar ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 10,
          backgroundColor: 'rgba(10,6,30,0.72)',
          borderBottomWidth: 1, borderBottomColor: 'rgba(180,140,55,0.3)',
        }}>
          {/* Progress */}
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: 'rgba(200,180,255,0.6)', letterSpacing: 2, fontWeight: '700' }}>STAGE</Text>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#E8D8A0' }}>
              {nextStage} <Text style={{ fontSize: 12, color: 'rgba(200,180,255,0.5)' }}>/ {TOTAL_STAGES}</Text>
            </Text>
          </View>

          {/* Coins */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
            backgroundColor: 'rgba(245,197,24,0.15)', paddingHorizontal: 12, paddingVertical: 6,
            borderRadius: 16, borderWidth: 1, borderColor: 'rgba(245,197,24,0.35)' }}>
            <Text style={{ fontSize: 16 }}>🪙</Text>
            <Text style={{ fontSize: 16, fontWeight: '900', color: '#F5C518' }}>{coins}</Text>
          </View>

          {/* Hearts */}
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {Array.from({ length: MAX_HEARTS }, (_, i) => (
                <Text key={i} style={{ fontSize: 20 }}>{i < hearts.count ? '❤️' : '🖤'}</Text>
              ))}
            </View>
            {timeLeft ? (
              <Text style={{ fontSize: 11, color: '#F5C518', fontWeight: '700', marginTop: 2 }}>+❤️ {timeLeft}</Text>
            ) : hearts.count >= MAX_HEARTS ? (
              <Text style={{ fontSize: 10, color: 'rgba(200,180,255,0.5)', marginTop: 2 }}>MAX</Text>
            ) : null}
          </View>

          {/* Shop button */}
          <TouchableOpacity
            onPress={() => setShopOpen(true)}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.10)',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: 'rgba(200,160,80,0.4)',
            }}>
            <Text style={{ fontSize: 20 }}>🏪</Text>
          </TouchableOpacity>
        </View>

        {/* ── Center: title ── */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{
            fontSize: 42, fontWeight: '900', letterSpacing: 4, color: '#E8D08A',
            textShadowColor: 'rgba(200,100,255,0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 22,
          }}>
            POTION
          </Text>
          <Text style={{
            fontSize: 42, fontWeight: '900', letterSpacing: 4, color: '#E8D08A',
            textShadowColor: 'rgba(200,100,255,0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 22,
            marginTop: -8,
          }}>
            SORT
          </Text>
          <Text style={{ fontSize: 12, color: 'rgba(200,180,255,0.65)', letterSpacing: 3, marginTop: 6 }}>
            ✦ LIQUID PUZZLE ✦
          </Text>
          {clearedStages.size > 0 && (
            <Text style={{ fontSize: 13, color: 'rgba(220,200,255,0.5)', marginTop: 14 }}>
              {clearedStages.size} ステージクリア済み
            </Text>
          )}
        </View>

        {/* ── Play button ── */}
        <View style={{ paddingHorizontal: 28, paddingBottom: 40 }}>
          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <TouchableOpacity
              onPress={handlePlay}
              activeOpacity={1}
              style={{
                backgroundColor: cfg.stageColor,
                paddingVertical: 22, borderRadius: 40, alignItems: 'center',
                borderWidth: 3, borderColor: 'rgba(255,240,180,0.6)',
                shadowColor: cfg.stageColor,
                shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.7, shadowRadius: 20, elevation: 16,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900',
                textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 }}>
                ステージ {nextStage}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700', letterSpacing: 2, marginTop: 2 }}>
                {cfg.bandName}  ·  {hearts.count > 0 ? `❤️ × ${hearts.count}` : 'ハートなし'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Daily Challenge button ── */}
          <TouchableOpacity
            onPress={() => {
              if (hearts.count <= 0) { setNoHearts(true); return; }
              onPlayChallenge(challenge);
            }}
            activeOpacity={0.82}
            style={{
              marginTop: 12,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              paddingVertical: 14, borderRadius: 28,
              backgroundColor: challengeDone ? 'rgba(39,199,87,0.18)' : 'rgba(20,10,50,0.85)',
              borderWidth: 1.5,
              borderColor: challengeDone ? '#27C757' : 'rgba(245,197,24,0.55)',
              shadowColor: challengeDone ? '#27C757' : '#F5C518',
              shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
            }}
          >
            <Text style={{ fontSize: 22 }}>{challengeDone ? '✅' : '🧪'}</Text>
            <View>
              <Text style={{ color: challengeDone ? '#27C757' : '#F5C518', fontSize: 13, fontWeight: '800', letterSpacing: 1 }}>
                {challengeDone ? 'TODAY\'S CHALLENGE DONE!' : 'TODAY\'S CHALLENGE'}
              </Text>
              <Text style={{ color: 'rgba(200,180,255,0.7)', fontSize: 11, marginTop: 1 }}>
                {challengeDone ? 'また明日！' : `クリアで🪙×2ボーナス！`}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Heart Shop modal ── */}
        {(shopOpen || noHearts) && (
          <Modal transparent animationType="fade">
            <View style={s.overlay}>
              <View style={[s.winCard, { gap: 10 }]}>
                <Text style={{ fontSize: 44 }}>{noHearts ? '💔' : '🏪'}</Text>
                <Text style={[s.winTitle, { fontSize: 22 }]}>
                  {noHearts ? 'ハートがありません' : 'ハートショップ'}
                </Text>

                {/* Coin balance */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: 'rgba(245,197,24,0.12)', paddingHorizontal: 16, paddingVertical: 8,
                  borderRadius: 16, borderWidth: 1, borderColor: 'rgba(245,197,24,0.35)' }}>
                  <Text style={{ fontSize: 18 }}>🪙</Text>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#F5C518' }}>{coins} コイン</Text>
                </View>

                {/* 1 heart for 30 coins */}
                <TouchableOpacity
                  style={[s.nextBtn, { backgroundColor: coins >= HEART_COIN_COST ? '#8B30E8' : '#AAA' }]}
                  onPress={() => buyHeart(1, HEART_COIN_COST)}
                  disabled={coins < HEART_COIN_COST}
                >
                  <Text style={s.nextBtnTxt}>🪙 {HEART_COIN_COST}コイン → ❤️ × 1</Text>
                </TouchableOpacity>

                {/* Full refill for 100 coins */}
                <TouchableOpacity
                  style={[s.nextBtn, { backgroundColor: coins >= REFILL_COIN_COST ? '#2F7BF0' : '#AAA' }]}
                  onPress={() => buyHeart(MAX_HEARTS - hearts.count, REFILL_COIN_COST)}
                  disabled={coins < REFILL_COIN_COST || hearts.count >= MAX_HEARTS}
                >
                  <Text style={s.nextBtnTxt}>🪙 {REFILL_COIN_COST}コイン → ❤️ 全回復</Text>
                </TouchableOpacity>

                {/* Watch ad */}
                <TouchableOpacity style={[s.nextBtn, { backgroundColor: '#E84343' }]}
                  onPress={() => { setNoHearts(false); setShopOpen(false); showRewarded(() => onAddHearts(3)); }}>
                  <Text style={s.nextBtnTxt}>📺 広告を見て❤️ × 3もらう</Text>
                </TouchableOpacity>

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
    ]).then(([rawP, rawI, rawT, rawH, rawC, rawD, rawR, rawA, rawCh]) => {
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
    }).catch(() => {});
    initSounds();
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
    if (clearedSet.size >= 1)  unlockAchievement('first_clear');
    if (clearedSet.size >= 5)  unlockAchievement('clear_5');
    if (clearedSet.size >= 10) unlockAchievement('clear_10');
    if (clearedSet.size >= 30) unlockAchievement('clear_30');
    if (clearedSet.size >= 50) unlockAchievement('clear_50');
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
    if (stageNum === REVIEW_STAGE) {
      AsyncStorage.getItem(REVIEW_KEY).then(raw => {
        if (!raw) setShowReview(true);
      }).catch(() => {});
    }
    setClearedStages(prev => {
      const next = new Set(prev);
      next.add(stageNum);
      saveProgress(next);
      const daily = null; // streak は dailyBonus から取得
      checkAchievements(next, stars, isChallenge, dailyBonus?.streak ?? 0);
      return next;
    });
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
        onTutorialDone={handleTutorialDone}
        onBack={() => { setChallengeConfig(null); setScreen('stages'); }}
        onNext={() => { setChallengeConfig(null); setScreen('stages'); }}
        onStageComplete={isChallenge
          ? (_, coins, stars) => handleChallengeComplete(coins, stars)
          : handleStageComplete}
        onUseItem={handleUseItem}
        onBuyItem={handleBuyItem}
      />
    );
  }

  return (
    <>
      <StageSelect
        clearedStages={clearedStages}
        hearts={hearts}
        coins={coins}
        challengeDone={challengeDone}
        onPlayChallenge={handlePlayChallenge}
        onAddHearts={addHearts}
        onSpendCoins={handleSpendCoins}
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
