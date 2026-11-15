import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import en from './en.json';
import { en as safetyEn, hi as safetyHi } from './modules/safety';

describe('safety i18n module', () => {
  it('has Hindi for every English key, and no empty strings', () => {
    expect(Object.keys(safetyHi).sort()).toEqual(Object.keys(safetyEn).sort());
    for (const [key, value] of Object.entries(safetyEn)) {
      expect(value.trim(), key).not.toBe('');
      expect(safetyHi[key].trim(), key).not.toBe('');
      // Interpolation placeholders must survive translation.
      expect([...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort(), key).toEqual(
        [...safetyHi[key].matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort(),
      );
      if (key.startsWith('help.') && key.endsWith('.title')) {
        expect(safetyEn).toHaveProperty(key.replace(/\.title$/, '.body'));
        expect(safetyEn).toHaveProperty(key.replace(/\.title$/, '.example'));
      }
    }
  });
  it('does not collide with the core message files', () => {
    for (const key of Object.keys(safetyEn)) expect(en, key).not.toHaveProperty(key);
  });
  it('defines every literal key the safety screens use', () => {
    const folder = join(__dirname, '..', 'features', 'safety');
    const known = { ...en, ...safetyEn } as Record<string, string>;
    const used = new Set<string>();
    for (const file of readdirSync(folder).filter((f) => /\.tsx?$/.test(f))) {
      const source = readFileSync(join(folder, file), 'utf8');
      for (const m of source.matchAll(/\bt\(\s*'([\w.-]+)'/g)) used.add(m[1]);
      for (const m of source.matchAll(/\bhelp="([\w-]+)"/g)) used.add(`help.${m[1]}.title`);
      for (const m of source.matchAll(/HelpTip id="([\w-]+)"/g)) used.add(`help.${m[1]}.title`);
    }
    const settings = readFileSync(join(folder, '..', 'settings', 'Settings.tsx'), 'utf8');
    expect(settings).toContain('auditTrail');
    used.add('setting.auditTrail');
    expect([...used].filter((k) => !(k in known))).toEqual([]);
    expect(used.size).toBeGreaterThan(80);
  });
  it('defines the dynamic keys: verify checks, actions, tours, rejects', () => {
    const ids = [
      'integrity',
      'orphanLines',
      'totals',
      'allocations',
      'numbering',
      'negativeStock',
      'balances',
    ];
    for (const id of ids)
      for (const k of [
        `safety.verify.${id}.title`,
        `safety.verify.${id}.ok`,
        `safety.verify.${id}.problem`,
        `help.safetyVerify-${id}.title`,
      ])
        expect(safetyEn, k).toHaveProperty(k);
    for (const reason of ['notBackup', 'newer', 'corrupt'])
      expect(safetyEn).toHaveProperty(`safety.restore.reject.${reason}`);
    for (const [screen, steps] of [
      ['backup', 3],
      ['recycleBin', 2],
      ['auditTrail', 3],
      ['verifyData', 2],
      ['lock', 3],
    ] as const)
      for (let n = 1; n <= steps; n++) {
        expect(safetyEn).toHaveProperty(`safety.tour.${screen}.${n}.title`);
        expect(safetyEn).toHaveProperty(`safety.tour.${screen}.${n}.body`);
      }
    for (const s of ['status.ok', 'status.warn', 'status.error'])
      expect(safetyEn).toHaveProperty(`safety.verify.${s}`);
    for (const type of ['sale', 'sale_return', 'estimate', 'sale_order', 'payment_in'])
      expect(en).toHaveProperty(`sales.type.${type}`);
  });
});
