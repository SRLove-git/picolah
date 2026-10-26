const nonModelPrefixes = new Set([
  'SONY', 'BOSE', 'SAMSUNG', 'APPLE', 'HUAWEI', 'XIAOMI', 'CANON', 'NIKON', 'JBL', 'LENOVO', 'DELL', 'ASUS', 'ACER',
  'LAZADA', 'SHOPEE', 'AMAZON', 'TIKTOK', 'TOKOPEDIA', 'TIKI',
  'BUDGET', 'UNDER', 'BELOW', 'MAX', 'MAXIMUM', 'PRICE', 'PRICES', 'REVIEW', 'REVIEWS', 'RATING', 'RATINGS',
  'SGD', 'MYR', 'THB', 'IDR', 'PHP', 'VND', 'USD', 'EUR', 'GBP',
]);

/** A complete alphanumeric model, not a platform, budget, or vague family name. */
export function explicitModelCodes(text: string): string[] {
  const matches = text.normalize('NFKC').matchAll(
    /(?<![a-z0-9])(wh[\s-]*ch[\s-]*\d{3,}(?:[\s-]*n)?|[a-z]{2,}[\s-]*\d{3,}(?:[\s-]*[a-z]{1,4}[\s-]*\d{1,2}(?!\d))*[a-z]{0,3})(?![a-z0-9])/gi,
  );
  return [...new Set([...matches].map((match) => compactModel(match[1]))
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
