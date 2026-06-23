import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  api,
  saveTokens,
  getAccessToken,
  clearTokens,
  savePhone,
  getStoredPhone,
} from '../lib/api';
import { cache } from '../lib/cache';

type Tokens = { accessToken: string; refreshToken: string };

type AuthContextValue = {
  isReady: boolean;
  isAuthed: boolean;
  locked: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  login: (phone: string, pin: string) => Promise<void>;
  applySession: (tokens: Tokens) => Promise<void>;
  logout: () => Promise<void>;
  tryBiometricUnlock: () => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<void>;
  setBiometricEnabled: (value: boolean) => Promise<void>;
  setLockSuspended: (value: boolean) => void;
};

const BIO_KEY = 'px_biometric';
const AuthContext = createContext<AuthContextValue>(null as any);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setReady] = useState(false);
  const [isAuthed, setAuthed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [biometricAvailable, setBioAvailable] = useState(false);
  const [biometricEnabled, setBioEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      const authed = !!token;
      const available =
        (await LocalAuthentication.hasHardwareAsync()) &&
        (await LocalAuthentication.isEnrolledAsync());
      const stored = await SecureStore.getItemAsync(BIO_KEY);
      const enabled = available && stored !== 'off';
      setBioAvailable(available);
      setBioEnabled(enabled);
      setAuthed(authed);
      setLocked(authed && enabled); // require unlock on cold start
      setReady(true);
    })();
  }, []);

  // Refs let the (once-subscribed) AppState listener read current values without
  // re-subscribing, and let us suspend locking during intentional excursions
  // (e.g. opening the image picker to change an avatar).
  const authedRef = useRef(false);
  const bioRef = useRef(false);
  const suspendRef = useRef(false);
  const bgAtRef = useRef<number | null>(null);

  useEffect(() => {
    authedRef.current = isAuthed;
  }, [isAuthed]);
  useEffect(() => {
    bioRef.current = biometricEnabled;
  }, [biometricEnabled]);

  // Lock grace period: returning quickly (app switch, glancing at a notification,
  // picking a photo) should NOT force a re-unlock — that's what made the app feel
  // slow on every return. We only re-lock if the app was in the background longer
  // than this window. (Like banking apps that auto-lock after a few idle minutes.)
  const LOCK_GRACE_MS = 90_000;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        // Remember when we left; don't lock yet.
        bgAtRef.current = Date.now();
      } else if (state === 'active') {
        const awayMs = bgAtRef.current ? Date.now() - bgAtRef.current : 0;
        bgAtRef.current = null;
        if (awayMs > LOCK_GRACE_MS && authedRef.current && bioRef.current && !suspendRef.current) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  // Called around intentional trips to system UI so they don't trigger a lock.
  const setLockSuspended = (value: boolean) => {
    suspendRef.current = value;
  };

  const applySession = async (tokens: Tokens) => {
    await saveTokens(tokens);
    setAuthed(true);
    setLocked(false);
    try {
      const me = await api.me();
      if (me?.phone) await savePhone(me.phone);
      if (me) cache.set('me', me); // warm the cache so screens render instantly
    } catch {
      // non-fatal
    }
  };

  const login = async (phone: string, pin: string) => {
    const res = await api.login(phone, pin);
    await applySession({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    await savePhone(phone);
  };

  const logout = async () => {
    await clearTokens();
    cache.clear(); // don't leak one account's data into the next
    setAuthed(false);
    setLocked(false);
  };

  const tryBiometricUnlock = async () => {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock PayXchange',
      fallbackLabel: 'Use PIN',
    });
    if (res.success) setLocked(false);
    return res.success;
  };

  // Fallback: re-authenticate against the backend with the saved phone + PIN.
  const unlockWithPin = async (pin: string) => {
    const phone = await getStoredPhone();
    if (!phone) throw new Error('No saved account — please log in again');
    const res = await api.login(phone, pin);
    await saveTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    setLocked(false);
  };

  const setBiometricEnabled = async (value: boolean) => {
    await SecureStore.setItemAsync(BIO_KEY, value ? 'on' : 'off');
    setBioEnabled(value);
  };

  return (
    <AuthContext.Provider
      value={{
        isReady,
        isAuthed,
        locked,
        biometricAvailable,
        biometricEnabled,
        login,
        applySession,
        logout,
        tryBiometricUnlock,
        unlockWithPin,
        setBiometricEnabled,
        setLockSuspended,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}