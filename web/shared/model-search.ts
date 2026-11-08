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

/** An alphanumeric model or useful model prefix, not a platform, budget, or vague family name. */
export function explicitModelCodes(text: string): string[] {
  const normalized = separateBrandAndModel(text);
  const patterns = [
    // XPS names contain a screen-size family followed by the actual four-digit
    // chassis code. Treating only "XPS 13" as the model allowed a newer XPS 13
    // page to satisfy an explicit "XPS 13 9340" request.
    /(?<![a-z0-9])((?:xps)[\s-]*(?:13|14|15|16|17)[\s-]*\d{4})(?![a-z0-9])/gi,
    /(?<![a-z0-9])((?:wh[\s-]*ch[\s-]*\d{3,}(?:[\s-]*n)?|[a-z]{2,}[\s-]*\d{3,}(?:[\s-]*[a-z]{1,4}[\s-]*\d{1,2}(?!\d))*[a-z]{0,3})(?:\s*\/\s*[a-z0-9]+)?)(?![a-z0-9])/gi,
    // TV and regional appliance prefixes can alternate digit and letter blocks
    // before the merchant-specific suffix (QA55QN85 -> QA55QN85DBKXXS).
    /(?<![a-z0-9])([a-z]{2,}[\s-]*\d{2,}[a-z]{1,4}\d{2,}[a-z0-9]*)(?![a-z0-9])/gi,
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
    const xps = compact.match(/^XPS(13|14|15|16|17)(\d{4})$/);
    if (xps) return `XPS-${xps[1]}-${xps[2]}`;
    if (compact.startsWith('WHCH')) return compact.replace(/^WHCH(?=\d)/, 'WH-CH');
    if (/^(?:WF|WH)\d{3,}XM\d+[A-Z]*$/.test(compact)) return compact.replace(/^(WF|WH)/, '$1-');
    return raw.includes('-') ? raw : compact.replace(/^([A-Z]+)(\d)/, '$1-$2');
  };
  const unique = [...new Set(matches.map(canonical)
    // Product names followed by a capacity are not invented model identifiers.
    .filter((model) => !/^[A-Z]+\d+(?:GB|TB|ML|MM|CM|KG|MG|G|OZ|LB|CL|DL|L)$/.test(compactModel(model)))
    .filter((model) => !nonModelPrefixes.has(model.match(/^[A-Z]+/)?.[0] ?? ''))
    )].filter((model) => model.replace(/[^A-Z0-9]/g, '').length >= 5 && model.length <= 40);
  // A more specific multi-part model may also satisfy an older generic regex
  // (XPS-13-9340 also looked like XPS-13). Keep only the longest identity.
  return unique.filter((model) => !unique.some((other) => other !== model
    && compactModel(other).startsWith(compactModel(model))));
}

export function compactModel(model: string): string {
  return model.normalize('NFKC').replace(/[\s-]+/g, '').toUpperCase();
}

/** Match a canonical model against a crawler identity. Stable appliance/TV
 * prefixes may omit a merchant-specific regional suffix; established Sony and
 * camera generations keep their exact boundaries. */
export function modelMatchesIdentity(model: string, identity: string): boolean {
  const compact = compactModel(model);
  const normalized = identity.normalize('NFKC').toUpperCase();
  const prefix = compact.split('').map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s-]*');
  const variantSuffix = /^\d[A-Z]{2,}\d{2,}[A-Z]{1,3}$/.test(compact) ? '[A-Z]{0,4}' : '';
  if (new RegExp(`(^|[^A-Z0-9])${prefix}${variantSuffix}(?=$|[^A-Z0-9])`).test(normalized)) return true;
  if (!/\d{2,}$/.test(compact) || /^(?:WF|WH)\d|^WHCH|^ZVE\d|^EOSR\d/.test(compact)) return false;
  return new RegExp(`(^|[^A-Z0-9])${prefix}(?:[A-Z0-9]{1,12}|[/.-][A-Z0-9]{1,8})(?:[/.-][A-Z0-9]{1,8})?(?=$|[^A-Z0-9])`).test(normalized);
}

/** Validate a model-only tool argument and normalize its supported separators. */
export function canonicalModelCode(value: string): string | null {
  const models = explicitModelCodes(value);
  return models.length === 1 && compactModel(value) === compactModel(models[0]) ? models[0] : null;
}

/** Discovery accepts one model/prefix while rejecting prose and multiple models. */
export function extractSearchModel(text: string): string | null {
  if (/https?:\/\/|配件|保护套|耳机套|耳塞套|充电盒|替换|\b(?:case|cover|skin|tips|pads|replacement|charger|cable)\b/i.test(text)) return null;
  const models = explicitModelCodes(text);
  return models.length === 1 ? models[0] : null;
}
