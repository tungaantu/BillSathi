/** Pure helpers to turn audit_log JSON into readable field-level changes. */
export interface FieldChange {
  path: string;
  before: string | null;
  after: string | null;
  kind: 'added' | 'removed' | 'changed';
}
const SKIP = new Set(['metadata']);
export function parseAudit(text: string | null): unknown {
  if (text === null || text === undefined) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
export function flatten(value: unknown, prefix = '', out: Map<string, string> = new Map()) {
  if (value === null || value === undefined) {
    if (prefix) out.set(prefix, '');
  } else if (Array.isArray(value)) {
    if (!value.length && prefix) out.set(prefix, '[]');
    value.forEach((v, i) => flatten(v, `${prefix}[${i + 1}]`, out));
  } else if (typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (!prefix && SKIP.has(key)) continue;
      flatten(v, prefix ? `${prefix}.${key}` : key, out);
    }
  } else out.set(prefix || 'value', String(value));
  return out;
}
export function diffRecords(before: unknown, after: unknown): FieldChange[] {
  const a = flatten(before),
    b = flatten(after);
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  const changes: FieldChange[] = [];
  for (const path of keys) {
    const x = a.get(path) ?? null,
      y = b.get(path) ?? null;
    if (x === y) continue;
    changes.push({
      path,
      before: x,
      after: y,
      kind: x === null ? 'added' : y === null ? 'removed' : 'changed',
    });
  }
  return changes;
}
const MONEY =
  /(^|\.)(subtotal|discount|taxable|cgst|sgst|igst|cess|charges|roundOff|total|price|amount|balance|openingBalance|salePrice|purchasePrice|wholesalePrice|mrp|creditLimit|discountAmount|received)$/;
export const isMoneyField = (path: string) => MONEY.test(path.replace(/\[\d+\]/g, ''));
/** "salePrice" -> "Sale price"; "document.lines[1].name" -> "Lines 1 · Name". */
export function humanizeField(path: string): string {
  const parts = path
    .replace(/^document\./, '')
    .split('.')
    .map((p) =>
      p
        .replace(/\[(\d+)\]/g, ' $1')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase()),
    );
  return parts.join(' · ');
}
export interface AuditLabel {
  kind: 'doc' | 'name' | 'setting' | 'none';
  text: string;
  docType?: string;
}
/** A short reference for the row: invoice number, party/item name or setting key. */
export function auditLabel(
  entity: string,
  before: unknown,
  after: unknown,
  padNumber: (prefix: string, n: number) => string,
): AuditLabel {
  const pick = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const rows = [pick(after), pick(before)];
  if (entity === 'txns') {
    for (const r of rows) {
      const doc = pick(r.document);
      const number = Number(r.number ?? doc.number),
        prefix = String(r.prefix ?? doc.prefix ?? '');
      if (Number.isFinite(number) && number > 0)
        return {
          kind: 'doc',
          text: padNumber(prefix, number),
          docType: String(r.type ?? doc.type ?? ''),
        };
    }
  }
  if (entity === 'settings') {
    const key = rows.map((r) => r.key).find((k) => typeof k === 'string');
    if (key) return { kind: 'setting', text: String(key) };
  }
  const name = rows.map((r) => r.name).find((n) => typeof n === 'string' && n);
  return name ? { kind: 'name', text: String(name) } : { kind: 'none', text: '' };
}
