export interface DocumentNumber {
  firmId: number;
  type: string;
  prefix: string;
  number: number;
}
export function nextDocumentNumber(
  existing: DocumentNumber[],
  firmId: number,
  type: string,
  prefix: string,
): DocumentNumber {
  const numbers = existing
    .filter((doc) => doc.firmId === firmId && doc.type === type && doc.prefix === prefix)
    .map((doc) => doc.number);
  if (numbers.some((n) => !Number.isSafeInteger(n) || n < 1))
    throw new RangeError('Invalid document number');
  const number = numbers.reduce((max, number) => Math.max(max, number), 0) + 1;
  if (!Number.isSafeInteger(number)) throw new RangeError('Document number limit reached');
  return { firmId, type, prefix, number };
}
export const displayDocumentNumber = (doc: DocumentNumber): string =>
  `${doc.prefix}${String(doc.number).padStart(4, '0')}`;
