/** A complete alphanumeric model, not a platform, budget, or vague family name. */
export function explicitModelCodes(text: string): string[] {
  const matches = text.normalize('NFKC').matchAll(
    /(?<![a-z0-9])([a-z]{2,}[\s-]*\d{3,}(?:[\s-]*[a-z]{1,4}[\s-]*\d{1,2}(?!\d))*)(?![a-z0-9])/gi,
  );
  return [...new Set([...matches].map((match) => match[1]
    .replace(/[\s-]+/g, '').toUpperCase()
    .replace(/^([A-Z]+)(\d)/, '$1-$2')))]
    .filter((model) => model.length >= 6 && model.length <= 40);
}

export function compactModel(model: string): string {
  return model.replace(/[\s-]+/g, '').toUpperCase();
}

/** Discovery is deliberately narrower than catalog lookup: only one full model. */
export function extractSearchModel(text: string): string | null {
  if (/https?:\/\/|配件|保护套|耳机套|耳塞套|充电盒|替换|\b(?:case|cover|skin|tips|pads|replacement|charger|cable)\b/i.test(text)) return null;
  const models = explicitModelCodes(text);
  return models.length === 1 ? models[0] : null;
}
