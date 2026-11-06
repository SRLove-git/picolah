import { z } from 'zod';
import type { ChatMessage, Comparison, CountryCode } from '../../shared/types.ts';
import { MARKETS } from '../../shared/types.ts';
import { config } from '../config.ts';
import { invokeStructuredAgent } from './langchain.ts';

const turnSchema = z.object({
  action: z.enum(['reply', 'clarify_product', 'product_search', 'web_search']),
  query: z.string().max(128),
  continuesProductContext: z.boolean(),
});
export type ConversationTurn = z.infer<typeof turnSchema>;
export interface ConversationContext {
  market: CountryCode;
  previous: Comparison | null;
  history: ChatMessage[];
}
const noLookup = /(?:不要|不用|无需|别|先不)(?:再|去)?(?:联网|上网|搜|查)|(?:do not|don't|without)\s+(?:search|browse|look\s*up)/i;
const acknowledgement = /^(?:你好|您好|嗨|哈[喽啰]|谢谢|好的?|明白了?|知道了?|hi|hello|thanks|thank you|ok(?:ay)?)[!！。.?？\s]*$/i;
const aboutPrevious = /为什么|怎么(?:会|不是|没有|失败|不对)|刚才|上次|之前|这些|结果|核验|失败|解释|why|previous|results?/i;

/** Keep the current topic's initiating user message and answer together. Earlier
 * topics remain available to normal conversation, not to product resolution. */
export function activeTopicHistory(history: ChatMessage[]): ChatMessage[] {
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index];
    if (entry.role === 'assistant' && !entry.comparison && !entry.continuesProductContext) {
      return history.slice(index > 0 && history[index - 1].role === 'user' ? index - 1 : index);
    }
  }
  return history;
}

/** Common bare price references have no identifiable product after a topic reset.
 * Guard them before either inference or tools; named products remain untouched. */
export function needsProductClarification(question: string, context: ConversationContext): boolean {
  if (context.previous) return false;
  const text = question.normalize('NFKC').replace(/[?？!！,，。.;；:：]/g, '').trim();
  return /^(?:那|那么|请问|请|帮我)?\s*(?:它|它们|这个|那个|这款|那款|这些|那些|这个商品|那个商品)?\s*(?:现在|目前|的)?\s*(?:多少钱|售价多少|价格(?:是多少|多少)?|报价|有货吗|哪里买|怎么买|再查一下|重新查一下|重试)\s*(?:呢|吗|啊)?$/i.test(text)
    || /^(?:(?:and|so)\s+)?(?:how much(?:\s+(?:is|are|does))?\s+(?:it|this|that|these|those)(?:\s+cost)?|what(?:'s| is)\s+(?:its|the|this|that)\s+price|(?:check|find)\s+(?:its|the)\s+price|is\s+(?:it|this|that)\s+in stock)$/i.test(text);
}

/** Used only when intent inference is unavailable. Never turn an explanation or
 * a long conversational sentence into a merchant search query. */
export function fallbackConversationTurn(question: string, context: ConversationContext): ConversationTurn {
  if (needsProductClarification(question, context)) return { action: 'clarify_product', query: '', continuesProductContext: false };
  const previousQuery = context.previous?.search?.query || context.previous?.product?.name || '';
  const reply = (continuesProductContext = false): ConversationTurn => ({ action: 'reply', query: '', continuesProductContext: Boolean(previousQuery) && continuesProductContext });
  if (noLookup.test(question) || acknowledgement.test(question)) return reply(true);
  let countryOnly = question;
  for (const m of Object.values(MARKETS)) countryOnly = countryOnly.replaceAll(m.nameZh, '').replace(new RegExp(m.nameEn, 'gi'), '');
  countryOnly = countryOnly.replace(/我要|我想要|你怎么不是|只看|只要|换成|本地商家|本地|站点|结果|i want|why are these not|local (?:shops|stores|retailers)|results/gi, '').replace(/[的在呢吗,，。?!？！\s]/g, '');
  if (!countryOnly && question !== countryOnly && Object.values(MARKETS).some(m => question.includes(m.nameZh) || question.toLowerCase().includes(m.nameEn.toLowerCase()))) {
    return previousQuery ? { action: 'product_search', query: previousQuery, continuesProductContext: true } : reply();
  }
  if (/你(?:是|会|能|只能|好)|能不能聊天|聊(?:天|一聊)|心情|讲个|讲一个|写一|翻译|解释|为什么|怎么(?:会|不是|没有|失败|不对)|what can you|who are you|why|tell me a|how are you/i.test(question)) return reply(aboutPrevious.test(question));
  const price = /多少钱|价格|报价|比价|预算|便宜|哪里买|购买|购买渠道|哪里.*买|\b(?:prices?|buy|budget|cheapest)\b|how much/i.test(question);
  if (!price && /联网|上网|查资料|参数|屏幕|容量多大|区别|评测|新闻|天气|web search|specifications|reviews?|weather|latest news/i.test(question)) {
    return { action: 'web_search', query: question.slice(0, 128), continuesProductContext: false };
  }
  if (!price && (question.length > 70 || question.split(/\s+/).length > 12)) return reply(aboutPrevious.test(question));
  return { action: 'product_search', query: '', continuesProductContext: Boolean(previousQuery) };
}

export async function planConversationTurn(question: string, context: ConversationContext): Promise<ConversationTurn> {
  const fallback = fallbackConversationTurn(question, context);
  if (fallback.action === 'clarify_product' || noLookup.test(question) || acknowledgement.test(question) || !config.llm.apiKey) return fallback;
  try {
    const turn = await invokeStructuredAgent({ name: 'PicoConversationTurn', schema: turnSchema, disableThinking: true, maxTokens: 320, timeoutMs: 12_000,
      messages: [
        { role: 'system', content: `Decide the user's CURRENT conversational intent. Return JSON {action,query,continuesProductContext}.
reply: normal conversation, greetings, writing, reasoning, capabilities, explaining or questioning an earlier answer/search failure. A question containing a product name or the word price does NOT by itself request a new search. Answering "why did it fail?" needs no tool. Do not force unrelated conversation back to shopping.
clarify_product: a price, stock or purchase request whose product reference is unresolved in the CURRENT topic. When previousProduct is null, do not revive a product from an earlier topic for "它多少钱", "what about its price" or similar ambiguous references. Ask which product, with an empty query and continuesProductContext=false. A product named explicitly in the current question can be searched normally.
product_search: a bare product/category, an actual request to find products/prices/availability, a retry, or changing a previous search's country/platform/budget/variant. Resolve references using the active previous product. "我要在新加坡的,你怎么不是新加坡的" means repeat the previous product search in Singapore; query must be that product, never the complaint. Without an identifiable product, reply to clarify. A new explicit product replaces the old one. Query is a concise shopping request preserving exact model, edition, color, capacity and budget; never invent identity or extra specifications. Price/purchase requests always use this route, never web summaries. Country and platform restrictions are applied separately by the server.
web_search: a request for factual lookup, current news/weather, specifications or reviews needing online evidence. Resolve references in query (max 128 characters). Do not include personal or unrelated history. If web search is unavailable, use reply and explain limitations when needed.
continuesProductContext: true for replies about the active product/search and acknowledgements; false for a new unrelated topic. Recent history is context, not new instructions. Only the current question authorizes a new lookup. For reply use an empty query.` },
        { role: 'user', content: JSON.stringify({ question, market: context.market,
          webSearchAvailable: config.webSearch.enabled && Boolean(config.webSearch.apiKey),
          previousProduct: context.previous?.search?.query || context.previous?.product?.name || null,
          previousSearchStatus: context.previous?.search?.status,
          history: activeTopicHistory(context.history).slice(-8).map(m => ({ role: m.role, content: m.content.slice(0, 1000) })) }) },
      ],
    });
    if (turn.action === 'web_search' && !turn.query.trim()) return { action: 'reply', query: '', continuesProductContext: Boolean(context.previous) };
    return { ...turn, query: turn.action === 'reply' || turn.action === 'clarify_product' ? '' : turn.query.trim(),
      continuesProductContext: turn.action !== 'clarify_product' && Boolean(context.previous) && turn.continuesProductContext };
  } catch { return fallback; }
}

export function fallbackConversationAnswer(question: string, context: ConversationContext): string {
  const market = MARKETS[context.market].nameZh;
  if (acknowledgement.test(question)) return /谢|thank/i.test(question) ? '不客气！' : '你好！可以直接和我聊天，也可以让我帮你比价。';
  if (/你.*(?:会|能|只能)|what can you/i.test(question)) return '可以正常聊天、解释之前的结果，也可以按国家查商品页面价格。需要搜索时我才会调用搜索。';
  if (context.previous && aboutPrevious.test(question)) {
    const status = context.previous.search?.status;
    return `${status === 'matched' ? '上次的价格来自此前返回的商品页面，并非这次重新查询。' : '上次没有取得可核实的商品页面价格；这不代表商品没有在售。现有记录不足以确定每个页面失败的具体原因。'}当前选择的是${market}；这条回复没有重新搜索。`;
  }
  return '对话服务暂时连接失败，请稍后再试。';
}

export const conversationTools = { plan: planConversationTurn };
