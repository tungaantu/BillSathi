import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  attemptsLeft,
  cooldownRemaining,
  hashSecret,
  newRecoveryCode,
  normalizeRecovery,
  passcodeService,
  recordFailure,
  validPin,
  verifySecret,
  COOLDOWN_MS,
  FRESH_ATTEMPTS,
} from './passcode';

const directories: string[] = [];
const folder = () => {
  const d = mkdtempSync(join(tmpdir(), 'billsathi-pin-'));
  directories.push(d);
  return d;
};
afterEach(() => {
  for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('PIN hashing', () => {
  it('stores a salted hash, never the PIN, and verifies only the right one', () => {
    const a = hashSecret('4821'),
      b = hashSecret('4821');
    expect(a.hash).not.toContain('4821');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(verifySecret('4821', a)).toBe(true);
    expect(verifySecret('4822', a)).toBe(false);
    expect(verifySecret('', a)).toBe(false);
  });
  it('accepts only 4-6 digit PINs', () => {
    for (const ok of ['1234', '12345', '123456']) expect(validPin(ok)).toBe(true);
    for (const bad of ['123', '1234567', '12a4', ' 1234', '', 1234, null])
      expect(validPin(bad)).toBe(false);
  });
  it('makes readable recovery codes that survive typing differences', () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normalizeRecovery(code.toLowerCase().replace(/-/g, ' '))).toBe(code.replace(/-/g, ''));
  });
});

describe('wrong-try cooldown', () => {
  it('locks for 30 seconds after the fifth wrong try, then resets', () => {
    let state = FRESH_ATTEMPTS;
    for (let i = 1; i <= 4; i++) {
      state = recordFailure(state, 1000);
      expect(cooldownRemaining(state, 1000)).toBe(0);
      expect(attemptsLeft(state)).toBe(5 - i);
    }
    state = recordFailure(state, 1000);
    expect(cooldownRemaining(state, 1000)).toBe(COOLDOWN_MS);
    expect(cooldownRemaining(state, 1000 + 12_000)).toBe(18_000);
    expect(cooldownRemaining(state, 1000 + COOLDOWN_MS)).toBe(0);
    expect(attemptsLeft(state)).toBe(5);
  });
});

describe('passcode service', () => {
  it('sets a PIN, verifies, counts failures with cooldown and persists them', () => {
    const dir = folder();
    let now = 10_000;
    const service = passcodeService(dir, () => now);
    expect(service.status()).toMatchObject({ hasPin: false, lockAfterMinutes: 0 });
    const set = service.setPin('4821');
    expect(set.ok && set.recoveryCode).toBeTruthy();
    expect(readFileSync(join(dir, 'security.json'), 'utf8')).not.toContain('4821');
    expect(service.verify('4821').ok).toBe(true);
    for (let i = 0; i < 4; i++)
      expect(service.verify('0000')).toMatchObject({ ok: false, cooldownMs: 0 });
    expect(service.verify('0000')).toMatchObject({ ok: false, cooldownMs: COOLDOWN_MS });
    // The right PIN is refused while cooling down, even after a restart.
    const restarted = passcodeService(dir, () => now);
    expect(restarted.verify('4821')).toMatchObject({ ok: false, cooldownMs: COOLDOWN_MS });
    now += COOLDOWN_MS + 1;
    expect(restarted.verify('4821').ok).toBe(true);
    expect(restarted.status().cooldownMs).toBe(0);
  });
  it('changes the PIN only with the current one, and removes it only with the PIN', () => {
    const service = passcodeService(folder());
    service.setPin('1111');
    expect(service.setPin('2222', 'bad')).toMatchObject({ ok: false });
    expect(service.verify('1111').ok).toBe(true);
    expect(service.setPin('2222', '1111').ok).toBe(true);
    expect(service.verify('2222').ok).toBe(true);
    expect(() => service.setPin('12')).toThrow('validation');
    expect(service.removePin('9999').ok).toBe(false);
    expect(service.removePin('2222').ok).toBe(true);
    expect(service.status().hasPin).toBe(false);
  });
  it('resets a forgotten PIN with the recovery code exactly once', () => {
    const service = passcodeService(folder());
    const first = service.setPin('1111');
    if (!first.ok) throw new Error('setup');
    expect(service.recover('WRONG-CODE-0000', '5555').ok).toBe(false);
    const reset = service.recover(first.recoveryCode.toLowerCase(), '5555');
    expect(reset.ok).toBe(true);
    expect(service.verify('5555').ok).toBe(true);
    expect(service.verify('1111').ok).toBe(false);
    expect(service.recover(first.recoveryCode, '6666').ok).toBe(false);
    if (reset.ok) expect(reset.recoveryCode).not.toBe(first.recoveryCode);
  });
  it('needs the PIN to weaken the lock settings', () => {
    const service = passcodeService(folder());
    expect(service.setOptions({ askPinForEdit: true }).ok).toBe(false);
    service.setPin('1111');
    expect(service.setOptions({ askPinForEdit: true, lockAfterMinutes: 5 }).ok).toBe(true);
    expect(service.status()).toMatchObject({ askPinForEdit: true, lockAfterMinutes: 5 });
    expect(service.setOptions({ askPinForEdit: false }).ok).toBe(false);
    expect(service.setOptions({ askPinForEdit: false }, '1111').ok).toBe(true);
    expect(service.setOptions({ lockAfterMinutes: 0 }, '1111').ok).toBe(true);
  });
});
