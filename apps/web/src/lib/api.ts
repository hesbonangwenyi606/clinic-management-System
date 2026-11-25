const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function apiUrl(): string {
  if (typeof window === 'undefined') return API_URL;
  const url = new URL(API_URL, window.location.origin);
  const loopback = ['localhost', '127.0.0.1'];
  if (loopback.includes(url.hostname) && loopback.includes(window.location.hostname)) {
    url.hostname = window.location.hostname;
  }
  return url.toString().replace(/\/$/, '');
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl()}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/password' && typeof window !== 'undefined') window.dispatchEvent(new Event('cms:session-expired'));
    const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new ApiError(message ?? `Request failed (${response.status}).`, response.status);
  }
  return response.json() as Promise<T>;
}
