/**
 * Small, explicit translations for marketplace queries, not product inference.
 * Unknown words, model numbers and capacities stay intact; never replace them
 * with a popular product or discard a constraint to manufacture a match.
 */
const TERMS: ReadonlyArray<readonly [string, string]> = [
  ['真无线蓝牙耳机', 'wireless earbuds'],
  ['真无线耳机', 'wireless earbuds'],
  ['入耳式耳机', 'earbuds'],
  ['头戴式耳机', 'headphones'],
  ['头戴耳机', 'headphones'],
  ['无线耳机', 'wireless headphones'],
  ['蓝牙耳机', 'Bluetooth headphones'],
  ['降噪耳机', 'noise cancelling headphones'],
  ['智能手机', 'smartphone'],
  ['笔记本电脑', 'laptop'],
  ['平板电脑', 'tablet'],
  ['空气炸锅', 'air fryer'],
  ['扫地机器人', 'robot vacuum'],
  ['显示器', 'monitor'],
  ['耳机', 'headphones'],
  ['手机', 'phone'],
  ['键盘', 'keyboard'],
  ['鼠标', 'mouse'],
  ['三星', 'Samsung'],
  ['索尼', 'Sony'],
  ['苹果', 'Apple'],
  ['小米', 'Xiaomi'],
  ['华为', 'Huawei'],
  ['联想', 'Lenovo'],
  ['华硕', 'Asus'],
  ['戴尔', 'Dell'],
  ['佳能', 'Canon'],
  ['尼康', 'Nikon'],
  ['黑色', 'Black'],
  ['白色', 'White'],
  ['银色', 'Silver'],
  ['蓝色', 'Blue'],
  ['粉色', 'Pink'],
];

// Longest match wins so “真无线耳机” is not partially translated as “耳机”.
const translations = new Map(TERMS);
const pattern = new RegExp([...translations.keys()].sort((a, b) => b.length - a.length).join('|'), 'g');

export function normalizeSearchLanguage(query: string): string {
  return query.normalize('NFKC')
    .replace(pattern, (term) => ` ${translations.get(term)!} `)
    .replace(/\s+/g, ' ').trim();
}
