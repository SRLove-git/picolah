const currencies = new Set(Intl.supportedValuesOf('currency'));

export function currencyDigits(currency: string): number | null {
  if (!currencies.has(currency)) return null;
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}
