import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_BASE_URL } from './config';
import { getDeviceId, getDeviceName } from './device';

// Tokens live in the phone's ENCRYPTED keychain, not plain storage — they're
// credentials. The app reads them automatically; you never copy a token again.
const ACCESS_KEY = 'px_access';
const REFRESH_KEY = 'px_refresh';
const PHONE_KEY = 'px_phone';
const HAS_ACCOUNT_KEY = 'px_has_account'; // persists across logout
const LAST_PHONE_KEY = 'px_last_phone';   // persists across logout (welcome-back prefill)

export async function saveTokens(t: { accessToken: string; refreshToken: string }) {
  await SecureStore.setItemAsync(ACCESS_KEY, t.accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, t.refreshToken);
}
export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_KEY);
}
export async function savePhone(phone: string) {
  await SecureStore.setItemAsync(PHONE_KEY, phone);
}
export async function getStoredPhone() {
  return SecureStore.getItemAsync(PHONE_KEY);
}
// Remembers that this device has completed an account (login or registration),
// so future launches show "Welcome back / log in" instead of the first-run intro
// and get-started screen. Deliberately NOT cleared on logout.
export async function markAccountExists(phone?: string) {
  await SecureStore.setItemAsync(HAS_ACCOUNT_KEY, '1');
  if (phone) await SecureStore.setItemAsync(LAST_PHONE_KEY, phone);
}
export async function getHasAccount(): Promise<boolean> {
  return (await SecureStore.getItemAsync(HAS_ACCOUNT_KEY)) === '1';
}
export async function getLastPhone(): Promise<string | null> {
  return SecureStore.getItemAsync(LAST_PHONE_KEY);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(PHONE_KEY);
}

// status 0 = the request never reached the server (offline / DNS / server down).
// isNetwork lets screens say "check your connection" instead of guessing that a
// failure means "wrong PIN".
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public isNetwork = false,
    public isTimeout = false,
  ) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 20000;

type RequestOptions = { method?: string; body?: unknown; auth?: boolean };

// Accurate fallback wording per status, so we never blame the user for a
// server/network problem.
function serverMessage(status: number): string {
  if (status >= 500) return 'PayXchange is having trouble right now. Please try again in a moment.';
  if (status === 408 || status === 504) return 'The server took too long to respond. Please try again.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status === 401) return 'Your session has expired. Please log in again.';
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return 'We couldn’t find what you were looking for.';
  return 'Something went wrong. Please try again.';
}

// Refresh the access token using the stored refresh token. Single-flighted so a
// burst of 401s (many screens loading at once on cold start) triggers exactly
// one refresh, not a stampede. Returns the new access token, or null if the
// refresh token is gone/expired (meaning the user really must log in again).
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!refreshToken) return null;
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null; // refresh token expired/revoked
      const data = await res.json();
      if (!data?.accessToken) return null;
      await saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken ?? refreshToken });
      return data.accessToken as string;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request<T = any>(path: string, options: RequestOptions = {}, _isRetry = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Identify this device so the backend can manage sessions per device.
  // Header values MUST be ASCII — strip anything else so a device's model name
  // can never break the request.
  try {
    headers['x-device-id'] = await getDeviceId();
    headers['x-device-name'] = getDeviceName().replace(/[^\x20-\x7E]/g, '').slice(0, 80) || 'Device';
    headers['x-device-platform'] = Platform.OS;
  } catch {
    // non-fatal — requests still work without device headers
  }

  if (options.auth) {
    const token = await getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  // Abort a request that hangs, so a dead network fails fast and clearly instead
  // of leaving the user staring at a spinner.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') {
      throw new ApiError(0, 'The connection timed out. Check your internet and try again.', true, true);
    }
    throw new ApiError(0, 'No connection to PayXchange. Check your internet and try again.', true);
  } finally {
    clearTimeout(timer);
  }

  // Access token expired? Transparently refresh once and retry, so reopening the
  // app after a while doesn't dump you into a blank/logged-out-feeling state.
  if (res.status === 401 && options.auth && !_isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) return request<T>(path, options, true);
    // Refresh failed — the session is genuinely over; surface it so the app can
    // send the user to log in.
    throw new ApiError(401, 'Your session has expired. Please log in again.');
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON (e.g. an HTML error/proxy page) — don't crash on it.
    if (!res.ok) throw new ApiError(res.status, serverMessage(res.status));
    return null as T;
  }

  if (!res.ok) {
    const raw = data?.message;
    const msg = Array.isArray(raw) ? raw.join(', ') : raw;
    // Trust a specific message from our API; otherwise say something accurate
    // for the status rather than a misleading generic.
    throw new ApiError(res.status, msg || serverMessage(res.status));
  }
  return data as T;
}

export const api = {
  login: (phone: string, pin: string) =>
    request('/auth/login', { method: 'POST', body: { phone, pin } }),

  register: (input: { phone: string; fullName?: string; email?: string }) =>
    request('/auth/register', { method: 'POST', body: input }),

  verifyOtp: (phone: string, code: string) =>
    request('/auth/verify-otp', { method: 'POST', body: { phone, code } }),

  setPin: (setupToken: string, pin: string) =>
    request('/auth/set-pin', { method: 'POST', body: { setupToken, pin } }),

  me: () => request('/users/me', { auth: true }),

  myCards: () => request('/funding-sources/me', { auth: true }),
  removeCard: (id: string) => request(`/funding-sources/${id}`, { method: 'DELETE', auth: true }),

  listBanks: () => request('/payout-destinations/banks', { auth: true }),
  resolvePayoutAccount: (accountNumber: string, bankCode: string) =>
    request(`/payout-destinations/resolve?accountNumber=${accountNumber}&bankCode=${bankCode}`, { auth: true }),
  myPayoutDestinations: () => request('/payout-destinations/me', { auth: true }),
  addPayoutDestination: (bankCode: string, accountNumber: string, accountName?: string) =>
    request('/payout-destinations', { method: 'POST', auth: true, body: { bankCode, accountNumber, accountName } }),
  setDefaultPayout: (id: string) =>
    request(`/payout-destinations/${id}/default`, { method: 'POST', auth: true }),
  removePayoutDestination: (id: string) =>
    request(`/payout-destinations/${id}`, { method: 'DELETE', auth: true }),

  createPaymentRequest: (input: {
    type: 'p2p' | 'merchant';
    amountKobo?: number; // omit for a static (any-amount) code
    description?: string; // optional
    isStatic?: boolean;
  }) => request('/payment-requests', { method: 'POST', auth: true, body: input }),

  resolvePaymentRequest: (token: string) =>
    request(`/payment-requests/resolve/${encodeURIComponent(token)}`, { auth: true }),

  initiateTransaction: (input: { token: string; fundingSourceId?: string; amountKobo?: number }) =>
    request('/transactions/initiate', { method: 'POST', auth: true, body: input }),

  confirmTransaction: (id: string, pin: string) =>
    request(`/transactions/${id}/confirm`, { method: 'POST', auth: true, body: { pin } }),

  listTransactions: () => request('/transactions', { auth: true }),

  getTransaction: (id: string) => request(`/transactions/${id}`, { auth: true }),

  verifyCheckout: (id: string) => request(`/transactions/${id}/verify`, { method: 'POST', auth: true }),

  monthlySummary: (month: string) =>
    request(`/transactions/summary?month=${month}`, { auth: true }),

  registerPushToken: (token: string, platform: string) =>
    request('/notifications/token', { method: 'POST', auth: true, body: { token, platform } }),

  freezeAccount: (pin: string) =>
    request('/account/freeze', { method: 'POST', auth: true, body: { pin } }),

  unfreezeAccount: (pin: string) =>
    request('/account/unfreeze', { method: 'POST', auth: true, body: { pin } }),

  listSessions: () => request('/account/sessions', { auth: true }),
  revokeSession: (id: string) =>
    request(`/account/sessions/${id}`, { method: 'DELETE', auth: true }),
  logoutOtherSessions: () =>
    request('/account/sessions/logout-others', { method: 'POST', auth: true }),

  createDispute: (transactionId: string, reason: string, details?: string) =>
    request('/disputes', { method: 'POST', auth: true, body: { transactionId, reason, details } }),
  listDisputes: () => request('/disputes', { auth: true }),
  getTransactionDispute: (txnId: string) =>
    request(`/disputes/transaction/${txnId}`, { auth: true }),

  updateAvatar: (avatar: string) =>
    request('/account/avatar', { method: 'POST', auth: true, body: { avatar } }),

  changePin: (currentPin: string, newPin: string) =>
    request('/account/change-pin', { method: 'POST', auth: true, body: { currentPin, newPin } }),

  deleteAccount: (pin: string) =>
    request('/account', { method: 'DELETE', auth: true, body: { pin } }),

  addMockCard: () => request('/funding-sources', { method: 'POST', auth: true, body: {} }),

  request,
};