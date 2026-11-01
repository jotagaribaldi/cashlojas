export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

function csrfToken() {
  return document.cookie.split('; ').find((entry) => entry.startsWith('cl_csrf='))?.split('=').slice(1).join('=');
}

async function refresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': decodeURIComponent(csrfToken() ?? '') },
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { accessToken: string };
        accessToken = data.accessToken;
        return data.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function api<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  const noRefresh = ['/auth/login', '/auth/register', '/auth/activate', '/auth/activation/check', '/auth/refresh', '/auth/logout'].includes(path);
  if (res.status === 401 && !retried && !noRefresh) {
    const token = await refresh();
    if (token) return api<T>(path, options, true);
  }
  if (!res.ok) {
    let message = 'Não foi possível concluir a solicitação.';
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
    } catch {
      // A resposta pode não conter JSON.
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const jsonBody = (value: unknown) => JSON.stringify(value);
