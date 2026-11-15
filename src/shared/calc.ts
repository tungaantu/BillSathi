/**
 * Safe calculator for the Calculator popup: + − × ÷, %, brackets and decimals.
 * A tiny recursive-descent parser — never `eval`. Returns null for anything it cannot read.
 */
export function calculate(input: string): number | null {
  const text = input
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/,/g, '')
    .replace(/\s+/g, '');
  if (!text || !/^[\d.+\-*/%()]+$/.test(text)) return null;
  let i = 0;
  const peek = () => text[i];
  function number(): number | null {
    const m = /^\d*\.?\d+|^\d+\./.exec(text.slice(i));
    if (!m) return null;
    i += m[0].length;
    let value = Number(m[0]);
    while (peek() === '%') {
      i++;
      value /= 100;
    }
    return value;
  }
  function factor(): number | null {
    if (peek() === '-') {
      i++;
      const v = factor();
      return v === null ? null : -v;
    }
    if (peek() === '+') {
      i++;
      return factor();
    }
    if (peek() === '(') {
      i++;
      const v = expression();
      if (v === null || peek() !== ')') return null;
      i++;
      return v;
    }
    return number();
  }
  function term(): number | null {
    let v = factor();
    while (v !== null && (peek() === '*' || peek() === '/')) {
      const op = text[i++];
      const r = factor();
      if (r === null || (op === '/' && r === 0)) return null;
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function expression(): number | null {
    let v = term();
    while (v !== null && (peek() === '+' || peek() === '-')) {
      const op = text[i++];
      // "200 + 18%" means 200 plus 18 % of 200, like a shop calculator.
      const start = i;
      const r = term();
      if (r === null) return null;
      const percentOfLeft = /^\d*\.?\d+%$/.test(text.slice(start, i));
      const amount = percentOfLeft ? v * r : r;
      v = op === '+' ? v + amount : v - amount;
    }
    return v;
  }
  const result = expression();
  if (result === null || i !== text.length || !Number.isFinite(result)) return null;
  // Hide floating-point dust (0.1 + 0.2) for display; money is never stored from here.
  return Math.round(result * 1e8) / 1e8;
}
/** Adds GST to a price, or takes it out of a GST-inclusive price (rate in percent). */
export function gstOn(amount: number, ratePercent: number, inclusive: boolean) {
  const tax = inclusive ? amount - amount / (1 + ratePercent / 100) : (amount * ratePercent) / 100;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    base: round(inclusive ? amount - tax : amount),
    tax: round(tax),
    total: round(inclusive ? amount : amount + tax),
  };
}
