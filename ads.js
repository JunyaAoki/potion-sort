import {
  BannerAd,
  BannerAdSize,
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

// 開発中はテスト広告ID、リリース時に本番IDに差し替える
const IS_TEST = false;

export const AD_IDS = {
  banner:        IS_TEST ? TestIds.BANNER        : 'ca-app-pub-5328629267151320/4187823918',
  interstitial:  IS_TEST ? TestIds.INTERSTITIAL  : 'ca-app-pub-5328629267151320/9521865477',
  rewarded:      IS_TEST ? TestIds.REWARDED      : 'ca-app-pub-5328629267151320/1318502437',
};

// ── Interstitial（レベルクリア後） ────────────────────────
let interstitial = null;
let interstitialReady = false;

export function loadInterstitial() {
  interstitial = InterstitialAd.createForAdRequest(AD_IDS.interstitial, {
    requestNonPersonalizedAdsOnly: true,
  });
  interstitial.addAdEventListener(AdEventType.LOADED, () => {
    interstitialReady = true;
  });
  interstitial.addAdEventListener(AdEventType.CLOSED, () => {
    interstitialReady = false;
    loadInterstitial(); // 次の広告を先読み
  });
  interstitial.load();
}

export function showInterstitial(onClose) {
  if (interstitialReady && interstitial) {
    interstitial.addAdEventListener(AdEventType.CLOSED, () => onClose?.());
    interstitial.show();
  } else {
    onClose?.();
  }
}

// ── Rewarded（ヒント取得時） ──────────────────────────────
let rewarded = null;
let rewardedReady = false;

export function loadRewarded() {
  rewarded = RewardedAd.createForAdRequest(AD_IDS.rewarded, {
    requestNonPersonalizedAdsOnly: true,
  });
  rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
    rewardedReady = true;
  });
  rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
    rewardedReady = false;
    loadRewarded();
  });
  rewarded.load();
}

export function showRewarded(onRewarded) {
  if (rewardedReady && rewarded) {
    rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => onRewarded?.());
    rewarded.show();
  } else {
    // 広告未準備の場合もヒントを付与（UX優先）
    onRewarded?.();
  }
}

export { BannerAd, BannerAdSize, AD_IDS as default };
