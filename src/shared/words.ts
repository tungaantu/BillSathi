import { assertPaise } from './money';
const small = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function words(n: bigint): string {
  if (n < 20n) return small[Number(n)];
  if (n < 100n) return tens[Number(n / 10n)] + (n % 10n ? ' ' + words(n % 10n) : '');
  for (const [size, name] of [
    [10000000n, 'Crore'],
    [100000n, 'Lakh'],
    [1000n, 'Thousand'],
    [100n, 'Hundred'],
  ] as const) {
    if (n >= size) return words(n / size) + ' ' + name + (n % size ? ' ' + words(n % size) : '');
  }
  return '';
}
export function amountInWords(paise: number): string {
  assertPaise(paise);
  const amount = BigInt(Math.abs(paise));
  return `${paise < 0 ? 'Minus ' : ''}${words(amount / 100n)} Rupees${amount % 100n ? ' and ' + words(amount % 100n) + ' Paise' : ''} Only`;
}
