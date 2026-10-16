import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_URL_KEY = 'telegrama.apiBaseUrl';
let apiBaseUrl = Platform.OS === 'android' ? 'http://10.0.2.2:5022' : 'http://localhost:5022';

export type ApiEnvelope<T> = {
  isSuccess?: boolean;
  message?: string;
  payLoad?: T;
  statusCode?: number;
  IsSuccess?: boolean;
  Message?: string;
  PayLoad?: T;
};

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

export function normalizeApiUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export async function hydrateApiUrl(): Promise<string> {
  const saved = await SecureStore.getItemAsync(API_URL_KEY);
  if (saved) apiBaseUrl = normalizeApiUrl(saved);
  return apiBaseUrl;
}

export async function saveApiUrl(value: string): Promise<string> {
  const normalized = normalizeApiUrl(value);
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error('Адреса має починатися з http:// або https://');
  }
  apiBaseUrl = normalized;
  await SecureStore.setItemAsync(API_URL_KEY, normalized);
  return normalized;
}

export function getApiUrl(): string {
  return apiBaseUrl;
}

function formEncoded(values: Record<string, string | number>): string {
  return Object.entries(values)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    token?: string | null;
    form?: Record<string, string | number>;
  } = {},
): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: string | undefined;

  if (options.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = formEncoded(options.form);
  }
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
    });
  } catch {
    throw new ApiError(`Не вдалося з’єднатись із API за адресою ${apiBaseUrl}`, 0);
  }

  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  const success = data?.isSuccess ?? data?.IsSuccess;
  if (!response.ok || success === false) {
    const validation = data?.errors
      ? Object.values(data.errors).flat().join('; ')
      : '';
    const message = data?.message ?? data?.Message ?? data?.title ?? validation ?? `HTTP ${response.status}`;
    throw new ApiError(String(message), response.status);
  }
  return data as ApiEnvelope<T>;
}

export function payloadOf<T>(result: ApiEnvelope<T>): T | null {
  return (result.payLoad ?? result.PayLoad ?? null) as T | null;
}
