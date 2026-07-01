import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';
import { navigationRef } from '../navigation/navigationRef';

// Expo Go (SDK 53+) REMOVED remote push on Android and throws the instant the
// push-token APIs are touched — which crashes the app on load. So in Expo Go we
// don't even load expo-notifications. Push stays dormant until you run a real
// development or production build, where everything below works normally.
const isExpoGo =
  Constants.executionEnvironment === 'storeClient' || (Constants as any).appOwnership === 'expo';

let Notifications: any = null;
if (!isExpoGo) {
  // Loaded lazily so Expo Go never initialises the remote-push module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

let tapSub: any = null;

// Ask permission, get the Expo push token, and register it with the backend.
// No-ops in Expo Go and on simulators.
export async function registerForPush(): Promise<void> {
  if (isExpoGo || !Notifications) return;
  try {
    if (!Device.isDevice) return;

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
    console.log('Push registration skipped:', String(e));
  }
}

// When a notification is tapped, jump to the Activity tab. No-ops in Expo Go.
export function attachNotificationTapHandler(): void {
  if (isExpoGo || !Notifications || tapSub) return;
  tapSub = Notifications.addNotificationResponseReceivedListener((response: any) => {
    const data = response?.notification?.request?.content?.data;
    if (data?.transactionId && navigationRef.isReady()) {
      navigationRef.navigate('Tabs', { screen: 'Activity' });
    }
  });
}