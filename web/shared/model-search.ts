const nonModelPrefixes = new Set([
  'SONY', 'BOSE', 'SAMSUNG', 'APPLE', 'HUAWEI', 'XIAOMI', 'CANON', 'NIKON', 'JBL', 'LENOVO', 'DELL', 'ASUS', 'ACER',
  'LEGO', 'PRO', 'PLUS', 'MINI', 'ULTRA', 'MAX', 'BALANCE', 'CREAM', 'ESSENCE', 'SERIES', 'EDITION', 'INSTA',
  'DIAMONDCLEAN', 'SONICARE', 'AIRFRYER', 'PURIFIER',
  'LAZADA', 'SHOPEE', 'AMAZON', 'TIKTOK', 'TOKOPEDIA', 'TIKI',
  'BUDGET', 'UNDER', 'BELOW', 'MAX', 'MAXIMUM', 'PRICE', 'PRICES', 'REVIEW', 'REVIEWS', 'RATING', 'RATINGS',
  'SGD', 'MYR', 'THB', 'IDR', 'PHP', 'VND', 'USD', 'EUR', 'GBP',
]);

/** Separate a known brand only when followed by a complete model-code shape. */
export function separateBrandAndModel(text: string): string {
  return text.normalize('NFKC').replace(
    /(?<![a-z0-9])(sony|bose|samsung|apple|huawei|xiaomi|canon|nikon|jbl|lenovo|dell|asus|acer|philips|dyson|panasonic|toshiba|tefal|midea|joyoung|kitchenaid|nespresso|delonghi|braun|roborock|ecovacs|tineco|karcher|bosch|electrolux|foreo)(?=(?:wh[-\s]*ch[-\s]*\d{3,}|\d[a-z]{2,}\d{2,}|[a-z]{1,4}(?:[-\s]+[a-z]{1,4})*[-\s]*\d{1,}))/gi,
    '$1 ',
  );
}

/** A complete alphanumeric model, not a platform, budget, or vague family name. */
export function explicitModelCodes(text: string): string[] {
  const normalized = separateBrandAndModel(text);
  const patterns = [
    /(?<![a-z0-9])((?:wh[\s-]*ch[\s-]*\d{3,}(?:[\s-]*n)?|[a-z]{2,}[\s-]*\d{3,}(?:[\s-]*[a-z]{1,4}[\s-]*\d{1,2}(?!\d))*[a-z]{0,3})(?:\s*\/\s*[a-z0-9]+)?)(?![a-z0-9])/gi,
    // Compact appliance SKUs can start with a series digit (5KSM175PS).
    /(?<![a-z0-9])(\d[a-z]{2,}\d{2,}[a-z0-9]*(?:\s*\/\s*[a-z0-9]+)?)(?![a-z0-9])/gi,
    // Regional appliance SKUs often contain a letter block before their first digit (ES-LS9A-K, EH-NA9N).
    /(?<![a-z0-9])([a-z]{1,3}(?:-[a-z]{1,4})+-?\d[a-z0-9]*(?:-[a-z0-9]{1,4})*(?:\s*\/\s*[a-z0-9]+)?)(?![a-z0-9])/gi,
    // Five-character appliance codes and one-letter regional codes are valid
    // while four-character fragments such as EC68 remain too ambiguous.
    /(?<![a-z0-9])([a-z]{3,4}[\s-]?\d{2}[a-z]{0,3}(?:\s*\/\s*[a-z0-9]+)?|[a-z][\s-]?\d{4,}[a-z]{0,3}\s*\/\s*[a-z0-9]+)(?![a-z0-9])/gi,
  ];
  const matches = patterns.flatMap((pattern) => [...normalized.matchAll(pattern)].map((match) => match[1]));
  const canonical = (value: string) => {
    const raw = value.normalize('NFKC').toUpperCase()
      .replace(/\s*\/\s*/g, '/').replace(/\s*-\s*/g, '-').replace(/\s+/g, '');
    const compact = compactModel(raw);
    if (compact.startsWith('WHCH')) return compact.replace(/^WHCH(?=\d)/, 'WH-CH');
    if (/^(?:WF|WH)\d{3,}XM\d+[A-Z]*$/.test(compact)) return compact.replace(/^(WF|WH)/, '$1-');
    return raw.includes('-') ? raw : compact.replace(/^([A-Z]+)(\d)/, '$1-$2');
  };
  return [...new Set(matches.map(canonical)
    // Product names followed by a capacity are not invented model identifiers.
    .filter((model) => !/^[A-Z]+\d+(?:GB|TB|ML|MM|CM|KG|MG|G|OZ|LB|CL|DL|L)$/.test(compactModel(model)))
    .filter((model) => !nonModelPrefixes.has(model.match(/^[A-Z]+/)?.[0] ?? ''))
    )]
    .filter((model) => model.replace(/[^A-Z0-9]/g, '').length >= 5 && model.length <= 40);
}

export function compactModel(model: string): string {
  return model.normalize('NFKC').replace(/[\s-]+/g, '').toUpperCase();
}

/** Validate a model-only tool argument and normalize its supported separators. */
export function canonicalModelCode(value: string): string | null {
  const models = explicitModelCodes(value);
  return models.length === 1 && compactModel(value) === compactModel(models[0]) ? models[0] : null;
}

/** Discovery is deliberately narrower than catalog lookup: only one full model. */
export function extractSearchModel(text: string): string | null {
  if (/https?:\/\/|配件|保护套|耳机套|耳塞套|充电盒|替换|\b(?:case|cover|skin|tips|pads|replacement|charger|cable)\b/i.test(text)) return null;
  const models = explicitModelCodes(text);
  return models.length === 1 ? models[0] : null;
}
