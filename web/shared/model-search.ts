const nonModelPrefixes = new Set([
  'SONY', 'BOSE', 'SAMSUNG', 'APPLE', 'HUAWEI', 'XIAOMI', 'CANON', 'NIKON', 'JBL', 'LENOVO', 'DELL', 'ASUS', 'ACER',
  'LEGO', 'PRO', 'PLUS', 'MINI', 'ULTRA', 'MAX', 'BALANCE', 'CREAM', 'ESSENCE', 'SERIES', 'EDITION', 'INSTA',
  'LAZADA', 'SHOPEE', 'AMAZON', 'TIKTOK', 'TOKOPEDIA', 'TIKI',
  'BUDGET', 'UNDER', 'BELOW', 'MAX', 'MAXIMUM', 'PRICE', 'PRICES', 'REVIEW', 'REVIEWS', 'RATING', 'RATINGS',
  'SGD', 'MYR', 'THB', 'IDR', 'PHP', 'VND', 'USD', 'EUR', 'GBP',
]);

/** Separate a known brand only when followed by a complete model-code shape. */
export function separateBrandAndModel(text: string): string {
  return text.normalize('NFKC').replace(
    /(?<![a-z0-9])(sony|bose|samsung|apple|huawei|xiaomi|canon|nikon|jbl|lenovo|dell|asus|acer|philips|dyson|panasonic|toshiba|tefal|midea|joyoung)(?=(?:wh[-\s]*ch[-\s]*\d{3,}|[a-z]{2,}[-\s]*\d{3,}))/gi,
    '$1 ',
  );
}

/** A complete alphanumeric model, not a platform, budget, or vague family name. */
export function explicitModelCodes(text: string): string[] {
  const matches = separateBrandAndModel(text).matchAll(
    /(?<![a-z0-9])((?:wh[\s-]*ch[\s-]*\d{3,}(?:[\s-]*n)?|[a-z]{2,}[\s-]*\d{3,}(?:[\s-]*[a-z]{1,4}[\s-]*\d{1,2}(?!\d))*[a-z]{0,3})(?:\s*\/\s*[a-z0-9]+)?)(?![a-z0-9])/gi,
  );
  return [...new Set([...matches].map((match) => compactModel(match[1]))
    // Product names followed by a capacity are not invented model identifiers.
    .filter((model) => !/^[A-Z]+\d+(?:GB|TB|ML|MM|CM|KG|MG|G|OZ|LB|CL|DL|L)$/.test(model))
    .filter((model) => !nonModelPrefixes.has(model.match(/^[A-Z]+/)?.[0] ?? ''))
    .map((model) => model.startsWith('WHCH')
      ? model.replace(/^WHCH(?=\d)/, 'WH-CH')
      : model.replace(/^([A-Z]+)(\d)/, '$1-$2')))]
    .filter((model) => model.length >= 6 && model.length <= 40);
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
