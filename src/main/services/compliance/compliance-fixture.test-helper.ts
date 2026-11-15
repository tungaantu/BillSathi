import { gstinChecksum } from '../../../shared/gstin';
import { blankDocument, type SaleDocument, type SaleLine } from '../../../shared/sales';
import type { Firm } from '../../../shared/types';
import type { ComplianceSource } from './common';

export const gstinFor = (first14: string) => first14 + gstinChecksum(first14);
export const FIRM_GSTIN = gstinFor('29ABCDE1234F1Z');
export const BUYER_GSTIN_KA = gstinFor('29AAPFU0939F1Z');
export const BUYER_GSTIN_MH = gstinFor('27AAPFU0939F1Z');

export const firm: Firm = {
  id: 1,
  name: 'Asha & Sons <Traders>',
  phone: '9876543210',
  category: 'grocery',
  stateCode: '29',
  gstin: FIRM_GSTIN,
  pan: '',
  address: '12 MG Road, Indiranagar, Bengaluru, Karnataka 560001',
  email: 'asha@example.com',
  bankName: '',
  accountNumber: '',
  ifsc: '',
  upiId: '',
  logo: null,
  signature: null,
  demo: false,
};

export const line = (overrides: Partial<SaleLine> = {}): SaleLine => ({
  itemId: 1,
  name: 'Basmati Rice',
  hsn: '1006',
  qty: 100,
  freeQty: 0,
  unitId: 1,
  price: 100000, // Rs 1,000.00
  inclusive: false,
  discountBps: 0,
  discountAmount: 0,
  taxBps: 1800,
  cessBps: 0,
  ...overrides,
});

export interface SourceOptions {
  place?: string;
  buyerGstin?: string;
  buyerAddress?: string;
  doc?: Partial<SaleDocument>;
  firm?: Partial<Firm>;
}
export function source(options: SourceOptions = {}): ComplianceSource {
  const place = options.place ?? '29';
  const base = blankDocument('sale', '29');
  const doc = {
    ...base,
    prefix: 'INV-',
    number: 1,
    date: '2026-11-10',
    placeOfSupply: place,
    partyName: 'Ravi Stores',
    billingAddress: options.buyerAddress ?? 'Shop 4, Market Road, Mysuru 570001',
    roundMode: 'off' as const,
    lines: [line()],
    ...options.doc,
  };
  return {
    firm: { ...firm, ...options.firm },
    party: {
      name: 'Ravi Stores',
      gstin: options.buyerGstin ?? (place === '29' ? BUYER_GSTIN_KA : BUYER_GSTIN_MH),
      stateCode: place,
      address: doc.billingAddress,
      phone: '9123456789',
      email: '',
    },
    shippingAddress: '',
    doc: {
      ...doc,
      id: 7,
      firmId: 1,
      total: 0,
      received: 0,
      balance: 0,
      status: 'posted',
      paymentStatus: 'unpaid',
      deletedAt: null,
      partyGstin: options.buyerGstin ?? '',
      firmState: '29',
    },
    units: { 1: { name: 'KILOGRAMS', symbol: 'Kg' } },
  };
}
