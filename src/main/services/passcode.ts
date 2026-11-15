import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LockOptions, LockStatus, PinAttempt } from '../../shared/safety-api';

/** App lock: salted scrypt hashes only, never the PIN itself. */
export interface SecretRecord {
  salt: string;
  hash: string;
}
export const MAX_ATTEMPTS = 5;
export const COOLDOWN_MS = 30_000;
export const LOCK_MINUTES = [0, 1, 5, 15, 30] as const;

export function hashSecret(secret: string, salt = randomBytes(16)): SecretRecord {
  return {
    salt: salt.toString('hex'),
    hash: scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex'),
  };
}
export function verifySecret(secret: string, record: SecretRecord): boolean {
  const expected = Buffer.from(record.hash, 'hex');
  const actual = scryptSync(secret, Buffer.from(record.salt, 'hex'), expected.length, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const validPin = (pin: unknown): pin is string =>
  typeof pin === 'string' && /^\d{4,6}$/.test(pin);

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** 12 characters from an alphabet without look-alikes, shown as XXXX-XXXX-XXXX. */
export function newRecoveryCode(): string {
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)]
    .map((g) => g.join(''))
    .join('-');
}
export const normalizeRecovery = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface AttemptState {
  failures: number;
  lockedUntil: number;
}
export const FRESH_ATTEMPTS: AttemptState = { failures: 0, lockedUntil: 0 };
export function cooldownRemaining(state: AttemptState, now: number): number {
  return Math.max(0, state.lockedUntil - now);
}
/** Five wrong tries in a row start a 30 second cooldown. */
export function recordFailure(state: AttemptState, now: number): AttemptState {
  const failures = state.failures + 1;
  return failures >= MAX_ATTEMPTS
    ? { failures: 0, lockedUntil: now + COOLDOWN_MS }
    : { failures, lockedUntil: state.lockedUntil };
}
export const attemptsLeft = (state: AttemptState) => MAX_ATTEMPTS - state.failures;

interface Stored {
  pin?: SecretRecord;
  recovery?: SecretRecord;
  lockAfterMinutes: LockStatus['lockAfterMinutes'];
  askPinForEdit: boolean;
  attempts: AttemptState;
}
const DEFAULTS: Stored = {
  lockAfterMinutes: 0,
  askPinForEdit: false,
  attempts: FRESH_ATTEMPTS,
};

export function passcodeService(userData: string, clock: () => number = Date.now) {
  const path = join(userData, 'security.json');
  const read = (): Stored => {
    try {
      if (!existsSync(path)) return { ...DEFAULTS };
      const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Stored>;
      const minutes = LOCK_MINUTES.find((m) => m === raw.lockAfterMinutes) ?? 0;
      return {
        pin: raw.pin,
        recovery: raw.recovery,
        lockAfterMinutes: minutes,
        askPinForEdit: raw.askPinForEdit === true,
        attempts: { ...FRESH_ATTEMPTS, ...raw.attempts },
      };
    } catch {
      return { ...DEFAULTS };
    }
  };
  const write = (data: Stored) => {
    writeFileSync(path + '.tmp', JSON.stringify(data));
    renameSync(path + '.tmp', path);
  };
  const status = (): LockStatus => {
    const s = read();
    return {
      hasPin: Boolean(s.pin),
      lockAfterMinutes: s.pin ? s.lockAfterMinutes : 0,
      askPinForEdit: Boolean(s.pin) && s.askPinForEdit,
      cooldownMs: cooldownRemaining(s.attempts, clock()),
    };
  };
  /** Checks the PIN, counting failures and enforcing the cooldown. */
  function verify(pin: unknown): PinAttempt {
    const s = read();
    if (!s.pin) return { ok: true, attemptsLeft: MAX_ATTEMPTS, cooldownMs: 0 };
    const now = clock();
    const wait = cooldownRemaining(s.attempts, now);
    if (wait > 0) return { ok: false, attemptsLeft: 0, cooldownMs: wait };
    if (validPin(pin) && verifySecret(pin, s.pin)) {
      write({ ...s, attempts: FRESH_ATTEMPTS });
      return { ok: true, attemptsLeft: MAX_ATTEMPTS, cooldownMs: 0 };
    }
    const attempts = recordFailure(s.attempts, now);
    write({ ...s, attempts });
    return {
      ok: false,
      attemptsLeft: attemptsLeft(attempts),
      cooldownMs: cooldownRemaining(attempts, now),
    };
  }
  /** First PIN, or a change when the current one is supplied. Returns a new recovery code. */
  function setPin(pin: unknown, current?: unknown) {
    if (!validPin(pin)) throw new Error('validation');
    const s = read();
    if (s.pin) {
      const check = verify(current);
      if (!check.ok) return { ...check, ok: false as const };
    }
    const recoveryCode = newRecoveryCode();
    write({
      ...read(),
      pin: hashSecret(pin),
      recovery: hashSecret(normalizeRecovery(recoveryCode)),
      attempts: FRESH_ATTEMPTS,
    });
    return { ok: true as const, recoveryCode };
  }
  function removePin(current: unknown): PinAttempt {
    const check = verify(current);
    if (!check.ok) return check;
    write({ ...DEFAULTS });
    return check;
  }
  /** Forgot the PIN: the one-time recovery code sets a new PIN and a fresh recovery code. */
  function recover(code: unknown, pin: unknown) {
    if (!validPin(pin) || typeof code !== 'string') throw new Error('validation');
    const s = read();
    const now = clock();
    if (!s.recovery) return { ok: false as const };
    if (cooldownRemaining(s.attempts, now) > 0) return { ok: false as const };
    if (!verifySecret(normalizeRecovery(code), s.recovery)) {
      write({ ...s, attempts: recordFailure(s.attempts, now) });
      return { ok: false as const };
    }
    const recoveryCode = newRecoveryCode();
    write({
      ...s,
      pin: hashSecret(pin),
      recovery: hashSecret(normalizeRecovery(recoveryCode)),
      attempts: FRESH_ATTEMPTS,
    });
    return { ok: true as const, recoveryCode };
  }
  /** Weakening protection (turning off the edit PIN or idle lock) needs the current PIN. */
  function setOptions(options: LockOptions, current?: unknown): PinAttempt {
    const s = read();
    if (!s.pin) return { ok: false, attemptsLeft: MAX_ATTEMPTS, cooldownMs: 0 };
    const minutes = options.lockAfterMinutes ?? s.lockAfterMinutes;
    const ask = options.askPinForEdit ?? s.askPinForEdit;
    if (!LOCK_MINUTES.includes(minutes)) throw new Error('validation');
    const weaker = (s.askPinForEdit && !ask) || (s.lockAfterMinutes !== 0 && minutes === 0);
    if (weaker) {
      const check = verify(current);
      if (!check.ok) return check;
    }
    write({ ...read(), lockAfterMinutes: minutes, askPinForEdit: ask });
    return { ok: true, attemptsLeft: MAX_ATTEMPTS, cooldownMs: 0 };
  }
  return { status, verify, setPin, removePin, recover, setOptions };
}
