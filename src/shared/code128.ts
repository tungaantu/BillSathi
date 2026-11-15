/**
 * Code 128 barcode encoder (code sets B and C), rendered as SVG — no network, no dependencies.
 * Each symbol is 6 alternating bar/space widths summing to 11 modules; STOP has 7 (13 modules).
 */
export const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]; // prettier-ignore
export const START_B = 104;
export const START_C = 105;
export const STOP = 106;

/** Printable ASCII 32–126 only (what scanners and label printers handle reliably). */
export function canEncode(text: string) {
  return text.length > 0 && text.length <= 80 && /^[\x20-\x7e]+$/.test(text);
}
/** Symbol values incl. start, checksum and stop. All-digit even-length text uses dense code set C. */
export function code128Values(text: string): number[] {
  if (!canEncode(text)) throw new Error('validation');
  const digits = /^\d+$/.test(text) && text.length % 2 === 0;
  const data = digits
    ? Array.from({ length: text.length / 2 }, (_, i) => Number(text.slice(i * 2, i * 2 + 2)))
    : [...text].map((c) => c.charCodeAt(0) - 32);
  const start = digits ? START_C : START_B;
  const checksum = data.reduce((sum, v, i) => sum + v * (i + 1), start) % 103;
  return [start, ...data, checksum, STOP];
}
/** Bar/space widths in modules, starting with a bar. */
export function code128Widths(text: string): number[] {
  return code128Values(text).flatMap((v) => [...PATTERNS[v]].map(Number));
}
export interface BarcodeSvgOptions {
  /** Width of one module in px (or mm when `unit` is mm). */
  module?: number;
  height?: number;
  /** Quiet zone each side, in modules (spec minimum 10). */
  quiet?: number;
  unit?: '' | 'mm';
}
/** Standalone SVG string; black bars on transparent background. */
export function code128Svg(text: string, opts: BarcodeSvgOptions = {}) {
  const { module = 2, height = 60, quiet = 10, unit = '' } = opts;
  const widths = code128Widths(text);
  let x = quiet;
  const bars: string[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="1"/>`);
    x += w;
  });
  const total = x + quiet;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total * module}${unit}" height="${height}${unit}" viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="${text.replace(/[<>&"]/g, '')}"><g fill="#000">${bars.join('')}</g></svg>`;
}
