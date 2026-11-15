import { assertPaise, decimalScaled, divideRound, safeNumber, sumPaise } from './money';
export type Discount = { kind: 'percent' | 'amount'; value: number };
export interface LineInput {
  qty: number | string;
  price: number;
  inclusive?: boolean;
  taxRate: number;
  cessRate?: number;
  discount?: Discount;
}
export interface LineResult {
  gross: number;
  discount: number;
  transactionDiscount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
}
export interface InvoiceInput {
  lines: LineInput[];
  firmState: string;
  placeOfSupply: string;
  charges?: LineInput[];
  discount?: Discount;
  roundOff?: { mode: 'nearest' | 'up' | 'down'; step: 100 | 50 | 10 };
}
function rate(value: number): bigint {
  const scaled = decimalScaled(value, 2);
  if (scaled < 0n || scaled > 10000n) throw new RangeError('Rate must be between 0 and 100');
  return scaled;
}
function discountAmount(base: number, discount?: Discount): number {
  if (!discount) return 0;
  const amount =
    discount.kind === 'amount'
      ? assertPaise(discount.value)
      : safeNumber(divideRound(BigInt(base) * rate(discount.value), 10000n));
  if (amount < 0 || amount > base) throw new RangeError('Discount cannot exceed the amount');
  return amount;
}
function prepare(line: LineInput): { gross: number; discount: number; taxable: number } {
  const qty = decimalScaled(line.qty, 3);
  if (qty < 0n || assertPaise(line.price) < 0)
    throw new RangeError('Quantity and price cannot be negative');
  const tax = rate(line.taxRate),
    cess = rate(line.cessRate ?? 0);
  const gross = safeNumber(divideRound(qty * BigInt(line.price), 1000n));
  const discount = discountAmount(gross, line.discount);
  const net = gross - discount;
  const taxable = line.inclusive
    ? safeNumber(divideRound(BigInt(net) * 10000n, 10000n + tax + cess))
    : net;
  return { gross, discount, taxable };
}
function calculate(line: LineInput, sameState: boolean, transactionDiscount: number): LineResult {
  const base = prepare(line);
  const taxable = base.taxable - transactionDiscount;
  let tax = safeNumber(divideRound(BigInt(taxable) * rate(line.taxRate), 10000n));
  let cess = safeNumber(divideRound(BigInt(taxable) * rate(line.cessRate ?? 0), 10000n));
  if (line.inclusive && transactionDiscount === 0) {
    const totalTax = base.gross - base.discount - taxable;
    const combinedRate = rate(line.taxRate) + rate(line.cessRate ?? 0);
    cess = combinedRate
      ? safeNumber(divideRound(BigInt(totalTax) * rate(line.cessRate ?? 0), combinedRate))
      : 0;
    tax = totalTax - cess;
  }
  // Split an odd tax paise deterministically, preserving the exact tax total.
  const cgst = sameState ? safeNumber(divideRound(BigInt(tax), 2n)) : 0;
  const sgst = sameState ? tax - cgst : 0;
  const igst = sameState ? 0 : tax;
  return {
    ...base,
    transactionDiscount,
    taxable,
    cgst,
    sgst,
    igst,
    cess,
    total: sumPaise([taxable, tax, cess]),
  };
}
export const calculateLine = (
  line: LineInput,
  firmState: string,
  placeOfSupply: string,
): LineResult => calculate(line, firmState === placeOfSupply, 0);
/** Transaction discount reduces taxable bases, including taxable charges, before GST.
 * Cumulative proportional allocation preserves every paise across mixed rates. */
export function calculateInvoice(input: InvoiceInput) {
  if (!input.firmState || !input.placeOfSupply)
    throw new RangeError('Choose the business and supply states');
  const all = [...input.lines, ...(input.charges ?? [])];
  const bases = all.map((line) => prepare(line).taxable);
  const subtotal = sumPaise(bases);
  const transactionDiscount = discountAmount(subtotal, input.discount);
  let cumulative = 0n,
    allocated = 0n;
  const calculated = all.map((line, index) => {
    cumulative += BigInt(bases[index]);
    const next = subtotal
      ? divideRound(BigInt(transactionDiscount) * cumulative, BigInt(subtotal))
      : 0n;
    const allocation = safeNumber(next - allocated);
    allocated = next;
    return calculate(line, input.firmState === input.placeOfSupply, allocation);
  });
  const totalOf = (key: keyof LineResult) => sumPaise(calculated.map((line) => line[key]));
  const beforeRoundOff = totalOf('total');
  let total = beforeRoundOff;
  if (input.roundOff) {
    const { mode, step } = input.roundOff;
    if (![100, 50, 10].includes(step)) throw new RangeError('Invalid rounding step');
    const n = BigInt(total),
      d = BigInt(step);
    const units = mode === 'nearest' ? divideRound(n, d) : mode === 'up' ? (n + d - 1n) / d : n / d;
    total = safeNumber(units * d);
  }
  return {
    lines: calculated.slice(0, input.lines.length),
    charges: calculated.slice(input.lines.length),
    gross: totalOf('gross'),
    lineDiscount: totalOf('discount'),
    transactionDiscount,
    taxable: totalOf('taxable'),
    cgst: totalOf('cgst'),
    sgst: totalOf('sgst'),
    igst: totalOf('igst'),
    cess: totalOf('cess'),
    beforeRoundOff,
    roundOff: total - beforeRoundOff,
    total,
  };
}
