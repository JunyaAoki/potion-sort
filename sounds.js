import { Audio } from 'expo-av';

const ASSETS = {
  select:    require('./assets/sounds/select.wav'),
  move:      require('./assets/sounds/move.wav'),
  error:     require('./assets/sounds/error.wav'),
  win:       require('./assets/sounds/win.wav'),
  complete1: require('./assets/sounds/complete1.wav'),
  complete2: require('./assets/sounds/complete2.wav'),
  complete3: require('./assets/sounds/complete3.wav'),
  complete4: require('./assets/sounds/complete4.wav'),
  complete5: require('./assets/sounds/complete5.wav'),
  complete6: require('./assets/sounds/complete6.wav'),
  complete7: require('./assets/sounds/complete7.wav'),
  complete8: require('./assets/sounds/complete8.wav'),
};

const cache = {};

export async function initSounds() {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
    });
    for (const [key, src] of Object.entries(ASSETS)) {
      const { sound } = await Audio.Sound.createAsync(src, { shouldPlay: false });
      cache[key] = sound;
    }
  } catch {}
}

export async function playSound(key) {
  try {
    const s = cache[key];
    if (!s) return;
    await s.setPositionAsync(0);
    await s.setRateAsync(1.0, false);
    await s.playAsync();
  } catch {}
}

// Play with pitch shift by creating a fresh Sound instance at the given rate
export async function playSoundAt(key, rate) {
  try {
    const src = ASSETS[key];
    if (!src) return;
    const { sound } = await Audio.Sound.createAsync(src, {
      shouldPlay: true,
      rate,
      shouldCorrectPitch: false,
    });
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.didJustFinish) sound.unloadAsync().catch(() => {});
    });
  } catch {}
}
