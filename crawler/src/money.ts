/**
 * Parse a marketplace price string without trusting the locale blindly.
 *
 *   "S$1,399.00"  -> 1399      (SG/MY/PH/TH)
 *   "RM 1,299"    -> 1299
 *   "Rp 1.299.000"-> 1299000   (IDR, no minor units)
 *   "1.299.000₫"  -> 1299000   (VND, no minor units)
 *   "$17.59"      -> 17.59
 */
export function parsePrice(raw: string, decimals: 0 | 2): number | null {
  const match = raw.match(/\d[\d.,\s]*/);
  if (!match) return null;
  let text = match[0].replace(/\s+/g, '').replace(/[.,]+$/, '');
  if (!text) return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? '.' : ',';
    const groupingSeparator = decimalSeparator === '.' ? ',' : '.';
    text = text.split(groupingSeparator).join('');
    if (decimalSeparator === ',') text = text.replace(',', '.');
  } else {
    const separator = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : '';
    if (separator) {
      const parts = text.split(separator);
      if (parts.length > 2) {
        // 1.299.000 / 1,299,000 -> grouping only
        text = parts.join('');
      } else {
        const [integer, fraction] = parts;
        if (decimals === 0) text = integer + fraction;
        else if (fraction.length === 2) text = `${integer}.${fraction}`;
        else text = integer + fraction; // 3 digits are thousands
      }
    }
  }

  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value <= 0 || value >= 1e12) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Find the first plausible price inside a text blob (for DOM fallbacks). */
export function findPrice(raw: string, decimals: 0 | 2): number | null {
  const candidates = raw.match(/(?:S\$|RM|Rp|฿|₱|\$|₫)\s?[\d.,]+/gi) ?? raw.match(/[\d][\d.,]*/g) ?? [];
  for (const candidate of candidates) {
    const value = parsePrice(candidate, decimals);
    if (value !== null) return value;
  }
  return null;
}
