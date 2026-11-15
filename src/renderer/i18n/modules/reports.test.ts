import { expect, it } from 'vitest';
import { REPORTS, REPORT_SECTIONS } from '../../../shared/reports';
import { en, hi } from './reports';

it('provides English and Hindi for every report, section, help topic and tour', () => {
  expect(Object.keys(en)).toEqual(Object.keys(hi));
  for (const [key, value] of Object.entries(en)) {
    expect(value.trim(), key).not.toBe('');
    expect(hi[key].trim(), key).not.toBe('');
    expect(hi[key], key).not.toMatch(/\?{2,}|\uFFFD/);
  }
  for (const def of REPORTS) {
    for (const key of [
      `reports.name.${def.id}`,
      `reports.desc.${def.id}`,
      ...['title', 'body', 'example'].map((part) => `help.report.${def.id}.${part}`),
    ]) {
      expect(en[key], key).toBeTruthy();
      expect(hi[key], key).toBeTruthy();
    }
    expect(hi[`reports.desc.${def.id}`]).toMatch(/[\u0900-\u097f]/);
  }
  for (const section of REPORT_SECTIONS) expect(en[`reports.section.${section}`]).toBeTruthy();
});
