import Constants from 'expo-constants';

// Your phone can't reach your laptop via "localhost" — that means the phone
// itself. In LAN dev mode, Expo already knows your laptop's address, so we
// borrow it automatically. If this ever fails (e.g. you run expo with
// --tunnel), set MANUAL_HOST to your laptop's IPv4 (Windows: run `ipconfig`,
// use the "IPv4 Address", e.g. 192.168.0.100).

const MANUAL_HOST = ''; // e.g. '192.168.0.100' — leave empty to auto-detect

const detected = Constants.expoConfig?.hostUri?.split(':')?.[0];
const host = MANUAL_HOST || detected || 'localhost';

export const API_BASE_URL = `http://${host}:3000`;