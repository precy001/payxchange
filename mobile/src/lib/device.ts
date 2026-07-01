import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'px_device_id';
let cachedId: string | null = null;

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// A stable per-install id, generated once and kept in the keychain. Lets the
// backend recognise this device across logins (so a PIN-unlock reuses its
// session instead of creating a new one).
export async function getDeviceId(): Promise<string> {
  if (cachedId) return cachedId;
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) {
    id = uuid();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
  cachedId = id;
  return id;
}

// A friendly label shown in the sessions list, e.g. "Samsung SM-G991 (Android)".
// ASCII only — header values can't contain non-ASCII characters.
export function getDeviceName(): string {
  const brand = Device.manufacturer || Device.brand || '';
  const model = Device.modelName || 'Device';
  const os = Platform.OS === 'ios' ? 'iOS' : 'Android';
  const name = `${[brand, model].filter(Boolean).join(' ')} (${os})`;
  return name.replace(/[^\x20-\x7E]/g, '').trim();
}