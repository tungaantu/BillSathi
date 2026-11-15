import { expect, it } from 'vitest';
import en from './en.json';
import hi from './hi.json';
it('provides Hindi for every English message and complete help topics', () => {
  expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
  for (const [key, value] of Object.entries(en)) {
    expect(value.trim()).not.toBe('');
    expect(hi[key as keyof typeof hi].trim()).not.toBe('');
    if (key.startsWith('help.') && key.endsWith('.title')) {
      expect(en).toHaveProperty(key.replace(/\.title$/, '.body'));
      expect(en).toHaveProperty(key.replace(/\.title$/, '.example'));
    }
  }
});
