import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from './en.json';
import hi from './hi.json';

type Messages = Record<string, string>;
const modules = Object.values(
  import.meta.glob<{ en: Messages; hi: Messages }>(['./modules/*.ts', '!./modules/*.test.ts'], {
    eager: true,
  }),
);
const all = (lang: 'en' | 'hi'): Messages =>
  Object.assign({}, lang === 'en' ? en : hi, ...modules.map((m) => m[lang]));
const EN = all('en'),
  HI = all('hi');
const has = (dict: Messages, key: string) =>
  key in dict || `${key}_one` in dict || `${key}_other` in dict;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|ts)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}
const source = files(join(__dirname, '..')).map((f) => readFileSync(f, 'utf8'));

describe('translations', () => {
  it('has Hindi for every English string and English for every Hindi string', () => {
    const missingHi = Object.keys(EN).filter((k) => !HI[k]?.trim());
    const missingEn = Object.keys(HI).filter((k) => !EN[k]?.trim());
    expect(missingHi).toEqual([]);
    expect(missingEn).toEqual([]);
  });
  it('never shows a garbled character', () => {
    const broken = Object.entries({ ...EN, ...HI }).filter(([, v]) => /�| \? /.test(v));
    expect(broken).toEqual([]);
  });
  it('defines every key the screens ask for', () => {
    const used = new Set<string>();
    for (const text of source)
      for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'/g)) used.add(m[1]);
    const missing = [...used].filter((k) => !has(EN, k));
    expect(missing).toEqual([]);
  });
  it('has a title, body and example for every help bubble', () => {
    const ids = new Set<string>();
    for (const text of source)
      for (const m of text.matchAll(/(?:HelpTip id|help)="([\w.-]+)"/g)) ids.add(m[1]);
    const missing = [...ids].flatMap((id) =>
      ['title', 'body', 'example'].map((p) => `help.${id}.${p}`).filter((k) => !EN[k] || !HI[k]),
    );
    expect(missing).toEqual([]);
  });
});
