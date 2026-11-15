import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { unwrap } from '../../../shared/types';
import type { LockStatus } from '../../../shared/safety-api';

interface LockState {
  locked: boolean;
  status: LockStatus | null;
  /** Action waiting for the PIN to be confirmed (see requirePin). */
  pending: (() => void) | null;
}
export const useLock = create<LockState>(() => ({ locked: false, status: null, pending: null }));

export async function refreshLockStatus(lockIfNeeded = false) {
  const status = unwrap(await window.api.safety.lock.status());
  useLock.setState((s) => ({
    status,
    locked: lockIfNeeded ? status.hasPin : s.locked && status.hasPin,
  }));
  return status;
}
export function lockNow() {
  if (!useLock.getState().status?.hasPin) return;
  // Close any open dialog so its focus trap cannot steal focus from the lock screen.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  useLock.setState({ locked: true });
}
/**
 * Runs `action` straight away, or after the PIN is confirmed when the owner chose
 * "Ask PIN before editing or deleting a transaction".
 */
export function requirePin(action: () => void) {
  const { status } = useLock.getState();
  if (status?.hasPin && status.askPinForEdit) useLock.setState({ pending: action });
  else action();
}
export const useRequirePin = () => requirePin;
/** For sensitive actions (like re-opening a closed year): asks whenever a PIN is set. */
export function requirePinIfSet(action: () => void) {
  if (useLock.getState().status?.hasPin) useLock.setState({ pending: action });
  else action();
}

/** Whole seconds until the timestamp `until`; re-renders four times a second while counting. */
export function useCountdown(until: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = until > Date.now() ? setInterval(tick, 250) : undefined;
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}
