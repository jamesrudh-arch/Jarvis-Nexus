'use client';

/**
 * OwnerGate — Gate 0 unlock panel (production app).
 *
 * Privileged API calls (memories, goals, agents, conversations, integrations,
 * world mutations, switches, storage) require the owner key. When any such
 * call is rejected (403 + X-Auth-Required), the transport dispatches
 * AUTH_REQUIRED_EVENT and this compact panel appears. The entered key is
 * VERIFIED against the server before it is stored (sessionStorage only —
 * never localStorage, never a cookie, cleared when the tab closes).
 */

import { useEffect, useRef, useState } from 'react';
import {
  AUTH_REQUIRED_EVENT,
  clearStoredOwnerKey,
  getStoredOwnerKey,
  notifyAuthRequired,
  ownerKeyHeaders,
  setStoredOwnerKey,
} from '@/nexus/ownerKeyClient';

export default function OwnerGate() {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'invalid' | 'ok'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onRequired = () => {
      setVisible(true);
      setState((s) => (s === 'ok' ? 'idle' : s));
      // Focus the input on the next paint (panel must exist first).
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onRequired);
  }, []);

  const unlock = async () => {
    const key = value.trim();
    if (!key) return;
    setState('checking');
    try {
      // Verify against a cheap guarded endpoint BEFORE storing anything.
      const res = await fetch('/api/v1/agents', { headers: { ...ownerKeyHeaders(), 'X-Owner-Key': key } });
      if (res.ok) {
        setStoredOwnerKey(key);
        setState('ok');
        setVisible(false);
        setValue('');
      } else if (res.status === 403) {
        setState('invalid');
      } else {
        // Server-side error that is NOT an auth rejection — keep the value,
        // let the owner retry; do not store an unverified key.
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  };

  if (!visible) return null;

  return (
    <section
      id="owner-gate"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 62,
        right: 16,
        zIndex: 26,
        maxWidth: 330,
        background: 'rgba(6, 18, 26, 0.94)',
        border: '1px solid var(--border-subtle)',
        borderLeft: '3px solid var(--amber)',
        padding: '10px 12px',
        borderRadius: 4,
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10.5, letterSpacing: '0.08em', color: 'var(--amber)' }}>
          OWNER KEY REQUIRED
        </span>
        <button
          type="button"
          className="btn-close"
          aria-label="Dismiss"
          onClick={() => setVisible(false)}
          style={{ color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12 }}
        >
          ✕
        </button>
      </div>
      <p style={{ color: 'var(--ice)', fontSize: 11.5, lineHeight: 1.45, margin: '7px 0 8px' }}>
        Memories, goals, agents, conversations and world commands are owner-only.
        Enter the OWNER_KEY to unlock this session — it stays in this tab only
        and is never written to disk.
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          ref={inputRef}
          type="password"
          value={value}
          placeholder="owner key"
          autoComplete="off"
          onChange={(e) => { setValue(e.target.value); setState('idle'); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void unlock(); }}
          style={{
            flex: 1,
            background: 'rgba(2, 7, 11, 0.8)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 3,
            color: 'var(--ice)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            padding: '6px 8px',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => void unlock()}
          disabled={state === 'checking' || !value.trim()}
          style={{
            background: 'transparent',
            border: '1px solid var(--cyan)',
            color: 'var(--cyan)',
            borderRadius: 3,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            padding: '6px 12px',
            cursor: state === 'checking' || !value.trim() ? 'default' : 'pointer',
            opacity: state === 'checking' || !value.trim() ? 0.55 : 1,
          }}
        >
          {state === 'checking' ? 'VERIFYING…' : 'UNLOCK'}
        </button>
      </div>
      {state === 'invalid' && (
        <p style={{ color: 'var(--red)', fontSize: 11, margin: '7px 0 0' }}>
          Invalid owner key — rejected by the server.
        </p>
      )}
      {getStoredOwnerKey() && (
        <button
          type="button"
          onClick={() => { clearStoredOwnerKey(); notifyAuthRequired(); }}
          style={{
            background: 'transparent', border: 'none', color: 'var(--muted)',
            fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
            padding: '6px 0 0', textDecoration: 'underline',
          }}
        >
          lock again (clear stored key)
        </button>
      )}
    </section>
  );
}
