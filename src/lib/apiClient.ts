import { auth } from './firebase';

/**
 * Performs an authenticated HTTP request attaching the current Firebase ID token
 * as a Bearer token in the Authorization header.
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${idToken}`;
    }
  } catch (tokenErr) {
    console.warn('[apiFetch] Could not retrieve auth token:', (tokenErr as any)?.message);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    data = await response.text();
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}
