import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_BASE_URL } from './config';
import { getDeviceId, getDeviceName } from './device';

// Tokens live in the phone's ENCRYPTED keychain, not plain storage — they're
// credentials. The app reads them automatically; you never copy a token again.
const ACCESS_KEY = 'px_access';
const REFRESH_KEY = 'px_refresh';
const PHONE_KEY = 'px_phone';

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
export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(PHONE_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type RequestOptions = { method?: string; body?: unknown; auth?: boolean };

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
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

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Is the backend running, and are you on the same WiFi?");
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = data?.message ?? 'Something went wrong';
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
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

  createPaymentRequest: (input: { type: 'p2p' | 'merchant'; amountKobo: number; description: string }) =>
    request('/payment-requests', { method: 'POST', auth: true, body: input }),

  resolvePaymentRequest: (token: string) =>
    request(`/payment-requests/resolve/${encodeURIComponent(token)}`, { auth: true }),

  initiateTransaction: (input: { token: string; fundingSourceId?: string }) =>
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