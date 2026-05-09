export function loadRewarded() {}
export function showRewarded(onRewarded) { onRewarded?.(); }
export function loadInterstitial() {}
export function showInterstitial(onClose) { onClose?.(); }
export const BannerAd = () => null;
export const BannerAdSize = {
  ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER',
  BANNER: 'BANNER',
};
export const AD_IDS = { banner: null, interstitial: null, rewarded: null };
