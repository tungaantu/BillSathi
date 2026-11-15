import {
  blankItem,
  blankParty,
  itemSchema,
  partySchema,
  type ItemInput,
  type PartyInput,
} from './masters';
import { rupeesToPaise } from './money';
export type ImportKind = 'parties' | 'items';
export interface ImportSheet {
  headers: string[];
  rows: string[][];
}
export interface ImportRow {
  row: number;
  name: string;
  errors: string[];
  data: PartyInput | ItemInput | null;
}
export interface ImportPreview {
  rows: ImportRow[];
  valid: number;
  invalid: number;
}
export const importFields = {
  parties: [
    'name',
    'phone',
    'email',
    'gstType',
    'gstin',
    'stateCode',
    'billingAddress',
    'shippingAddress',
    'openingBalance',
    'openingDate',
    'creditLimit',
    'active',
  ],
  items: [
    'name',
    'type',
    'code',
    'hsn',
    'salePrice',
    'purchasePrice',
    'openingQty',
    'openingPrice',
    'openingDate',
    'minStock',
    'location',
    'taxRate',
    'unit',
    'category',
    'inclusive',
    'purchaseInclusive',
    'wholesalePrice',
    'wholesaleQty',
    'mrp',
    'secondaryUnit',
    'conversion',
    'discountType',
    'discountPercent',
    'discountAmount',
  ],
} as const;
export function validateImport(
  kind: ImportKind,
  sheet: ImportSheet,
  mapping: Record<string, string>,
  options: {
    codes?: string[];
    taxes?: { id: number; rateBps: number }[];
    units?: { id: number; symbol: string }[];
    categories?: { id: number; name: string }[];
  } = {},
): ImportPreview {
  const codes = new Set(options.codes ?? []);
  const rows = sheet.rows.map((cells, index): ImportRow => {
    const errors: string[] = [];
    const read = (field: string) => (cells[sheet.headers.indexOf(mapping[field])] ?? '').trim();
    const amount = (field: string, fallback = 0) => {
      const v = read(field);
      if (!v) return fallback;
      try {
        return rupeesToPaise(v);
      } catch {
        errors.push(field);
        return 0;
      }
    };
    const bool = (field: string, fallback: boolean) => {
      const v = read(field).toLowerCase();
      if (!v) return fallback;
      if (['true', 'yes', '1'].includes(v)) return true;
      if (['false', 'no', '0'].includes(v)) return false;
      errors.push(field);
      return fallback;
    };
    const numeric = (field: string, fallback = 0) => {
      const v = read(field);
      if (!v) return fallback;
      if (!/^\d+(\.\d+)?$/.test(v)) errors.push(field);
      return Number(v);
    };
    let data: PartyInput | ItemInput | null = null;
    if (kind === 'parties') {
      const p = {
        ...blankParty(),
        name: read('name'),
        phone: read('phone'),
        email: read('email'),
        gstin: read('gstin'),
        gstType: read('gstType') || 'consumer',
        stateCode: read('stateCode'),
        billingAddress: read('billingAddress'),
        shippingAddress: read('shippingAddress'),
        openingBalance: amount('openingBalance'),
        openingDate: read('openingDate') || blankParty().openingDate,
        creditLimit: read('creditLimit') ? amount('creditLimit') : null,
        active: bool('active', true),
      };
      const parsed = partySchema.safeParse(p);
      if (parsed.success) data = parsed.data;
      else errors.push(...parsed.error.issues.map((i) => String(i.path[0])));
    } else {
      const unit = read('unit'),
        category = read('category'),
        secondary = read('secondaryUnit');
      const tax = read('taxRate') ? numeric('taxRate') : null;
      const matchedTax = options.taxes?.find((t) => t.rateBps === tax! * 100);
      const matchedUnit = options.units?.find((u) => u.symbol.toLowerCase() === unit.toLowerCase());
      const matchedSecondary = options.units?.find(
        (u) => u.symbol.toLowerCase() === secondary.toLowerCase(),
      );
      const matchedCategory = options.categories?.find(
        (c) => c.name.toLowerCase() === category.toLowerCase(),
      );
      if (tax !== null && !matchedTax) errors.push('taxRate');
      if (unit && !matchedUnit) errors.push('unit');
      if (secondary && !matchedSecondary) errors.push('secondaryUnit');
      if (category && !matchedCategory) errors.push('category');
      const p = {
        ...blankItem(),
        name: read('name'),
        type: read('type') || 'product',
        code: read('code'),
        hsn: read('hsn'),
        salePrice: amount('salePrice'),
        purchasePrice: amount('purchasePrice'),
        openingPrice: amount('openingPrice', amount('purchasePrice')),
        openingQty: numeric('openingQty'),
        openingDate: read('openingDate') || blankItem().openingDate,
        minStock: numeric('minStock'),
        location: read('location'),
        taxRateId: matchedTax?.id ?? null,
        unitId: matchedUnit?.id ?? null,
        categoryId: matchedCategory?.id ?? null,
        inclusive: bool('inclusive', false),
        purchaseInclusive: bool('purchaseInclusive', false),
        wholesalePrice: amount('wholesalePrice'),
        wholesaleQty: numeric('wholesaleQty'),
        mrp: amount('mrp'),
        secondaryUnitId: matchedSecondary?.id ?? null,
        conversion: numeric('conversion', 1),
        discountType: read('discountType') || 'percent',
        discountBps: amount('discountPercent'),
        discountAmount: amount('discountAmount'),
      };
      if (p.code) {
        if (codes.has(p.code)) errors.push('code');
      }
      const parsed = itemSchema.safeParse(p);
      if (parsed.success) data = parsed.data;
      else errors.push(...parsed.error.issues.map((i) => String(i.path[0])));
      if (p.code && !errors.length) codes.add(p.code);
    }
    return {
      row: index + 2,
      name: read('name'),
      errors: [...new Set(errors)],
      data: errors.length ? null : data,
    };
  });
  return {
    rows,
    valid: rows.filter((r) => r.data).length,
    invalid: rows.filter((r) => !r.data).length,
  };
}
