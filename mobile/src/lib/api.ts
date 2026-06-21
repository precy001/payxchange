import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from './config';

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

  initiateTransaction: (input: { token: string; fundingSourceId: string }) =>
    request('/transactions/initiate', { method: 'POST', auth: true, body: input }),

  confirmTransaction: (id: string, pin: string) =>
    request(`/transactions/${id}/confirm`, { method: 'POST', auth: true, body: { pin } }),

  listTransactions: () => request('/transactions', { auth: true }),

  monthlySummary: (month: string) =>
    request(`/transactions/summary?month=${month}`, { auth: true }),

  updateAvatar: (avatar: string) =>
    request('/account/avatar', { method: 'POST', auth: true, body: { avatar } }),

  changePin: (currentPin: string, newPin: string) =>
    request('/account/change-pin', { method: 'POST', auth: true, body: { currentPin, newPin } }),

  deleteAccount: (pin: string) =>
    request('/account', { method: 'DELETE', auth: true, body: { pin } }),

  addMockCard: () => request('/funding-sources', { method: 'POST', auth: true, body: {} }),

  request,
};