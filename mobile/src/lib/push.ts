import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';
import { navigationRef } from '../navigation/navigationRef';

// Show notifications while the app is in the foreground too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let tapSub: Notifications.Subscription | null = null;

// Ask permission, get the Expo push token, and register it with the backend.
// No-ops quietly where remote push isn't available (e.g. Expo Go on Android).
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return; // no push on simulators

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    const projectId =
      (Constants.expoConfig as any)?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    const tokenResp = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (tokenResp?.data) {
      await api.registerPushToken(tokenResp.data, Platform.OS);
    }
  } catch (e) {
    // Remote push is unavailable in Expo Go on Android (SDK 53+); ignore.
    console.log('Push registration skipped:', String(e));
  }
}

// When a notification is tapped, jump to the Activity tab (where the
// transaction lives). Safe to call once at startup.
export function attachNotificationTapHandler(): void {
  if (tapSub) return;
  tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as any;
    if (data?.transactionId && navigationRef.isReady()) {
      navigationRef.navigate('Tabs', { screen: 'Activity' });
    }
  });
}