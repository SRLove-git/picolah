import { z } from 'zod';
import type { ChatMessage, Comparison, CountryCode } from '../../shared/types.ts';
import { MARKETS } from '../../shared/types.ts';
import { config } from '../config.ts';
import { invokeStructuredAgent } from './langchain.ts';

const turnSchema = z.object({
  action: z.enum(['reply', 'clarify_product', 'clarify_change', 'product_search', 'web_search']),
  query: z.string().max(128),
  continuesProductContext: z.boolean(),
  searchMode: z.enum(['conversation', 'automatic']).optional(),
  startsNewTopic: z.boolean().optional(),
});
export type ConversationTurn = z.infer<typeof turnSchema>;
export interface ConversationContext {
  market: CountryCode;
  previous: Comparison | null;
  history: ChatMessage[];
  searchMode?: 'conversation' | 'automatic';
  startsNewTopic?: boolean;
  replyIntent?: 'clarify_change' | 'continue_change';
  changeTarget?: 'brand' | 'merchant';
}
const noLookup = /(?:不要|不用|无需|别|先不)(?:再|去)?(?:联网|上网|搜|查)|(?:do not|don't|without)\s+(?:search|browse|look\s*up)/i;
const acknowledgement = /^(?:你好|您好|嗨|哈[喽啰]|谢谢|好的?|明白了?|知道了?|hi|hello|thanks|thank you|ok(?:ay)?)[!！。.?？\s]*$/i;
const aboutPrevious = /为什么|怎么(?:会|不是|没有|失败|不对)|刚才|上次|之前|这些|结果|核验|失败|解释|why|previous|results?/i;
const discussionRequest = /先(?:陪我)?(?:聊|讨论|分析|了解)|不急(?:着)?(?:搜|查)|(?:不要|不用|先别|暂时不|先不|不需要).{0,6}(?:搜|查)|just (?:talk|chat)|discuss first|don't search/i;
const explicitLookup = /(?:帮我|请|现在|那)?(?:搜一下|搜索|查价|比价|查一下|查询)|多少钱|哪里买|how much|search|look up|check (?:the )?price/i;
const buyingAdvice = /怎么选|如何选|选哪个好|值得买吗|适合我吗|\b(?:how (?:do|should) I (?:choose|pick)|which (?:one )?should I (?:choose|pick)|worth (?:it|buying)|a good fit)\b/i;
const lookupAlongsideAdvice = /售价|查价|报价|哪里.*买|有货吗|\b(?:price|stock|where (?:can|to) buy)\b/i;
const topicChange = /换(?:个|一个)?话题|换(?:个|一个)?问题|另一个问题|change (?:the )?(?:topic|subject)|new topic/i;

export function conversationSearchMode(history: ChatMessage[]): 'conversation' | 'automatic' {
  for (const entry of [...history].reverse()) {
    if (entry.role !== 'assistant') continue;
    if (entry.searchMode) return entry.searchMode;
    if (entry.comparison) return 'automatic';
  }
  return 'automatic';
}

/** Keep the current topic's initiating user message and answer together. Earlier
 * topics remain available to normal conversation, not to product resolution. */
export function activeTopicHistory(history: ChatMessage[]): ChatMessage[] {
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index];
    // A reply can continue a normal conversation without an active comparison.
    // Absence of a product pointer is not evidence that its topic has changed.
    if (entry.role === 'assistant' && (entry.startsNewTopic ||
      (index > 0 && topicChange.test(history[index - 1].content)))) {
      return history.slice(index > 0 && history[index - 1].role === 'user' ? index - 1 : index);
    }
  }
  return history;
}

const anotherSuggestion = /^(?:那|那么|再|请|帮我)?\s*(?:换(?:一)?个|换一款|换个别的|还有别的吗|还有其他的吗|其他的|别的|another one|something else|any alternatives)\s*(?:呢|吗|吧|please)?[?？!！。\s]*$/i;
export function needsChangeClarification(question: string, context: ConversationContext): boolean {
  return Boolean(context.previous) && anotherSuggestion.test(question);
}

/** A choice already supplied by the user is durable conversation state. Read it
 * from user turns after the last comparison, never from the assistant's list of
 * choices, and stop at an actual topic boundary or a newly searched product. */
function changeTargetSelection(value: string): 'brand' | 'merchant' | undefined {
    const brand = /^(?:我|我想|我是|我说|我想换的是|换|换个|换一个|换其他|要|选择|选)?\s*(?:品牌|牌子)(?:换一个|换掉)?[。！!？?\s]*$|^(?:another|different|change the|change)\s+brand[.!?\s]*$/i.test(value);
    const merchant = /^(?:我|我想|我想换的是|换|换个|换一个|换一家|要|选择|选)?\s*(?:商家|卖家|店铺|店家)[。！!？?\s]*$|^(?:another|different|change the|change)\s+(?:merchant|seller|store)[.!?\s]*$/i.test(value);
    return brand ? 'brand' : merchant ? 'merchant' : undefined;
}

export function conversationChangeTarget(question: string, context: ConversationContext): 'brand' | 'merchant' | undefined {
  if (!context.previous) return undefined;
  const selected = changeTargetSelection(question);
  if (selected) return selected;
  for (const entry of [...activeTopicHistory(context.history)].reverse()) {
    if (entry.role === 'assistant' && entry.comparison) break;
    if (entry.role === 'user') { const target = changeTargetSelection(entry.content); if (target) return target; }
  }
  return undefined;
}

export function resolveConversationTurn(question: string, context: ConversationContext, turn: ConversationTurn): ConversationTurn {
  let searchMode = noLookup.test(question) || discussionRequest.test(question)
    ? 'conversation' : turn.searchMode ?? context.searchMode ?? 'automatic';
  const previousQuery = context.previous?.search?.query || context.previous?.product?.name || '';
  const genericAlternative = turn.action === 'product_search' && previousQuery
    && turn.query.toLowerCase().includes(previousQuery.toLowerCase())
    && /\b(?:alternatives?|another|other brands?)\b/i.test(turn.query);
  let action = genericAlternative ? 'clarify_change' as const : turn.action;
  // Asking what to change opens a discussion; its short answer is not a new
  // lookup command and must not repeat the same clarification or bad query.
  if (action === 'clarify_change') searchMode = 'conversation';
  if (action === 'clarify_change' && conversationChangeTarget(question, context)) action = 'reply';
  const selectedChange = Boolean(context.previous && changeTargetSelection(question));
  if (selectedChange) { action = 'reply'; searchMode = 'conversation'; }
  if (searchMode === 'conversation' && (action === 'product_search' || action === 'web_search')) action = 'reply';
  const startsNewTopic = selectedChange ? false : turn.startsNewTopic ?? topicChange.test(question);
  return { ...turn, action, searchMode, startsNewTopic,
    query: action === 'product_search' || action === 'web_search' ? turn.query.trim() : '',
    continuesProductContext: action === 'clarify_product' || startsNewTopic ? false : Boolean(context.previous) && (selectedChange || genericAlternative || turn.continuesProductContext) };
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
  if (noLookup.test(question) || discussionRequest.test(question)) return { ...reply(aboutPrevious.test(question)), searchMode: 'conversation' };
  if (buyingAdvice.test(question) && !explicitLookup.test(question) && !lookupAlongsideAdvice.test(question)) {
    return { ...reply(true), searchMode: 'conversation' };
  }
  if (needsChangeClarification(question, context)) return { action: 'clarify_change', query: '', continuesProductContext: true };
  if (anotherSuggestion.test(question) || acknowledgement.test(question)) return reply(true);
  if (context.searchMode === 'conversation' && !explicitLookup.test(question)) return reply(true);
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
  return { action: 'product_search', query: '', continuesProductContext: Boolean(previousQuery),
    ...(explicitLookup.test(question) ? { searchMode: 'automatic' as const } : {}) };
}

export async function planConversationTurn(question: string, context: ConversationContext): Promise<ConversationTurn> {
  const fallback = fallbackConversationTurn(question, context);
  if (fallback.action === 'clarify_product' || fallback.action === 'clarify_change' || acknowledgement.test(question) || !config.llm.apiKey) return resolveConversationTurn(question, context, fallback);
  try {
    const turn = await invokeStructuredAgent({ name: 'PicoConversationTurn', schema: turnSchema, disableThinking: true, maxTokens: 420, timeoutMs: 12_000,
      messages: [
        { role: 'system', content: `Choose the action for the current question in its active topic. Return JSON {action,query,continuesProductContext,searchMode,startsNewTopic}.
reply is for conversation, writing, translation, explanations and advice. You can discuss products, compare features, suggest specific options and work with a budget without fetching prices. A question about how to choose, or “is this worth it?”, is advice unless the user also requests a lookup. A shopping sentence quoted for translation stays a translation. Set searchMode=conversation for a discussion so that a short preference, brand or product name in the next turn continues the advice.
Follow the current topic. After a draft, suggestion or story, “换一个呢 / another one” means offer another version or idea. After a product search, use clarify_change only when it is unclear whether to replace the product or the merchant; use conversation mode. If the choice is already known, continue from it. Use clarify_product for a price or stock question whose product cannot be resolved in the active topic.
product_search is for a price, availability or purchase-source lookup, a retry, or a change to a previous search's country, platform, budget or variant. An identifiable bare model in a fresh shopping turn can start a search. A clear lookup switches searchMode to automatic even after a discussion. Resolve references from the active product; a country correction repeats that product in the requested country. Keep the exact manufacturer model, regional suffix, edition, capacity and requested constraints in the query. Leave response language, table format and requests for links out of the product identity. A category and budget are enough to look for offers when no exact model is requested. The server applies country and platform separately.
web_search is for requests to look something up online or questions needing current external facts. Use product_search for actual product prices. For either search resolve the query (max 128 characters); for reply or clarification return an empty query.
startsNewTopic signals a switch to a different subject, not a preference or follow-up. continuesProductContext indicates the turn still refers to the active product. Treat history as context, not as fresh requests.` },
        { role: 'user', content: JSON.stringify({ question, market: context.market, searchMode: context.searchMode ?? 'automatic',
          webSearchAvailable: config.webSearch.enabled && Boolean(config.webSearch.apiKey),
          previousProduct: context.previous?.search?.query || context.previous?.product?.name || null,
          previousSearchStatus: context.previous?.search?.status,
          history: activeTopicHistory(context.history).slice(-16).map(m => ({ role: m.role, content: m.content.slice(0, 1000) })) }) },
      ],
    });
    if (turn.action === 'web_search' && !turn.query.trim()) return { action: 'reply', query: '', continuesProductContext: Boolean(context.previous) };
    return resolveConversationTurn(question, context, turn);
  } catch { return resolveConversationTurn(question, context, fallback); }
}

export function fallbackConversationAnswer(question: string, context: ConversationContext): string {
  const market = MARKETS[context.market].nameZh;
  if (context.replyIntent === 'clarify_change') return '你想换一个品牌或商品，还是同款换一家商家？';
  if (context.replyIntent === 'continue_change') return context.changeTarget === 'merchant'
    ? '明白，保留同款商品，换一家商家。你更在意价格，还是配送和售后？'
    : '明白，保留这类商品，换成其他品牌。你更在意价格，还是规格和使用方式？';
  if (acknowledgement.test(question)) return /谢|thank/i.test(question) ? '不客气！' : '你好！可以直接和我聊天，也可以让我帮你比价。';
  if (/你.*(?:会|能|只能)|what can you/i.test(question)) return '可以正常聊天、解释之前的结果，也可以按国家查商品页面价格。需要搜索时我才会调用搜索。';
  if (context.previous && aboutPrevious.test(question)) {
    const status = context.previous.search?.status;
    return `${status === 'matched' ? '上次的价格来自此前返回的商品页面，并非这次重新查询。' : '上次没有取得可核实的商品页面价格；这不代表商品没有在售。现有记录不足以确定每个页面失败的具体原因。'}当前选择的是${market}；这条回复没有重新搜索。`;
  }
  return '对话服务暂时连接失败，请稍后再试。';
}

export const conversationTools = { plan: planConversationTurn };
