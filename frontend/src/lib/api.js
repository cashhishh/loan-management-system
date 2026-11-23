import axios from 'axios';

/**
 * Axios client. The access token lives only in memory (not localStorage, so XSS
 * can't exfiltrate a long-lived credential); the refresh token is an httpOnly
 * cookie. On a 401 we transparently refresh once and replay the request.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
});

let accessToken = null;
let onSessionExpired = () => {};
let refreshPromise = null;

export const setAccessToken = (t) => {
  accessToken = t;
};
export const setSessionExpiredHandler = (fn) => {
  onSessionExpired = fn;
};

export function refreshSession() {
  // De-duplicate: many requests failing at once trigger a single refresh.
  refreshPromise ??= api
    .post('/auth/refresh', null, { _skipAuthRetry: true })
    .then((res) => {
      setAccessToken(res.data.accessToken);
      return res.data;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._skipAuthRetry && !original._retried) {
      original._retried = true;
      try {
        await refreshSession();
        return api(original);
      } catch {
        setAccessToken(null);
        onSessionExpired();
      }
    }
    return Promise.reject(error);
  },
);

/** Human-readable message from an API error. */
export function errorMessage(err, fallback = 'Something went wrong') {
  const e = err?.response?.data?.error;
  if (!e) return err?.message === 'Network Error' ? 'Cannot reach the server' : fallback;
  if (e.details?.length) return `${e.message}: ${e.details.map((d) => d.message).join('; ')}`;
  return e.message || fallback;
}

/** Fetch a protected file as a blob URL (for previews/downloads with the auth header). */
export async function fetchBlobUrl(url) {
  const res = await api.get(url, { responseType: 'blob' });
  return URL.createObjectURL(res.data);
}

export async function downloadFile(url, filename) {
  const href = await fetchBlobUrl(url);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
