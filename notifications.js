import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Potion Sort',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ハートが満タンになる時刻に通知をスケジュール
export async function scheduleHeartFullNotification(nextRegenAt, currentHearts, maxHearts) {
  await Notifications.cancelScheduledNotificationAsync('heart-full').catch(() => {});
  if (!nextRegenAt || currentHearts >= maxHearts) return;

  const heartsNeeded = maxHearts - currentHearts;
  const fullAt = new Date(nextRegenAt + (heartsNeeded - 1) * 30 * 60 * 1000);
  if (fullAt <= new Date()) return;

  await Notifications.scheduleNotificationAsync({
    identifier: 'heart-full',
    content: {
      title: '❤️ ハートが満タンになりました！',
      body: 'Potion Sort を再開しましょう！',
      sound: true,
    },
    trigger: { type: 'date', date: fullAt },
  }).catch(() => {});
}

// 毎日20時にデイリーリマインダー
export async function scheduleDailyReminder() {
  await Notifications.cancelScheduledNotificationAsync('daily-reminder').catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: 'daily-reminder',
    content: {
      title: '🧪 今日もポーションを整理しよう！',
      body: 'デイリーボーナスをお見逃しなく 🎁',
      sound: true,
    },
    trigger: { type: 'daily', hour: 20, minute: 0 },
  }).catch(() => {});
}
