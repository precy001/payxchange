import Constants from 'expo-constants';

// -----------------------------------------------------------------------------
// API base URL
// -----------------------------------------------------------------------------
// Production/APK builds talk to the deployed backend on Railway. Local dev in
// Expo Go talks to your laptop over the LAN.
//
// How it decides:
//  • A real build (APK/TestFlight) runs in "standalone"/"storeClient" — there's
//    no dev server, so we use PROD_API_URL.
//  • Expo Go on your LAN auto-detects your laptop's IP (same as before).
//  • Override either by editing the two constants below.

// Your deployed backend. REPLACE with your Railway domain (no trailing slash).
const PROD_API_URL = 'https://pleasant-mindfulness-production-9f5e.up.railway.app';

// Force a specific host in dev (e.g. '192.168.0.100'); empty = auto-detect.
const MANUAL_HOST = '';

// executionEnvironment: 'storeClient' = Expo Go, 'standalone'/'bare' = a real build.
const isDevClient = Constants.executionEnvironment === 'storeClient';

const detected = Constants.expoConfig?.hostUri?.split(':')?.[0];
const host = MANUAL_HOST || detected || 'localhost';
const devUrl = `http://${host}:3000`;

// Use the deployed URL in a real build; the laptop in Expo Go dev.
export const API_BASE_URL = isDevClient ? devUrl : PROD_API_URL;