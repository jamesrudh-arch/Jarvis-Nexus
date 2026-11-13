/**
 * JARVIS NEXUS — client-side owner-key management (Gate 0).
 *
 * The owner's key lives in sessionStorage only:
 *   - never written to disk (localStorage) or a cookie,
 *   - cleared when the tab closes (same security posture as the FastAPI
 *     sanctuary login gate, with reload-in-tab convenience),
 *   - attached to every privileged request as `X-Owner-Key` (the guard also
 *     accepts `Authorization: Bearer` for API clients).
 *
 * When a privileged call is rejected, the transport dispatches
 * AUTH_REQUIRED_EVENT so the OwnerGate panel can collect the key. After the
 * key is stored, AUTH_RESOLVED_EVENT lets open surfaces (InspectorDrawer)
 * re-fetch their guarded data.
 */

const STORAGE_KEY = 'jarvis.ownerKey';

export const AUTH_REQUIRED_EVENT = 'jarvis:auth-required';
export const AUTH_RESOLVED_EVENT = 'jarvis:auth-key-set';

export function getStoredOwnerKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setStoredOwnerKey(key: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* storage unavailable — key simply won't persist */
  }
  window.dispatchEvent(new CustomEvent(AUTH_RESOLVED_EVENT));
}

export function clearStoredOwnerKey(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Headers carrying the stored owner key (empty when not yet unlocked). */
export function ownerKeyHeaders(): Record<string, string> {
  const key = getStoredOwnerKey();
  return key ? { 'X-Owner-Key': key } : {};
}

/** True when a 403 response is an owner-auth rejection (not a switch policy). */
export function isOwnerAuthRejection(res: Response, detail?: string): boolean {
  if (res.headers.get('X-Auth-Required') === 'owner-key') return true;
  return res.status === 403 && typeof detail === 'string' && detail.includes('wner key');
}

/** Tell the UI an unlock is needed (OwnerGate listens). */
export function notifyAuthRequired(): void {
  window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
}
