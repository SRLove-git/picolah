/** Keep previously saved replies readable without their obsolete system footer. */
export function shoppingReplyText(content: string): string {
  return content
    .replace(/(?:\r?\n)*以上为已入库报价，最近采集时间：[^；\r\n]+；本次未实时抓取，下单前请核对商家页面。/g, '')
    .replace(/过期和演示报价不会用于比价，当前不会自动发起实时抓取。/g, '')
    .replace(/^商品库已找到 /, '找到 ')
    .replace(/^商品库暂未收录与/, '暂未找到与')
    .replace(/^商品库中的匹配商品：/, '找到这些商品：')
    .replace(/的已入库(?=到手价|预估到手价)/g, '的')
    .split('\n')
    .filter((line) => !/(?:下单前|去平台前).*(?:优惠券|券后价|券后到手价)/.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
