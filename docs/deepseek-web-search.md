# Pico conversation web search

Enable `WEB_SEARCH_ENABLED=true` to let Pico select web search for factual questions, specifications, reviews, current information, and explicit requests such as “联网搜索飞利浦 NA221/09 的容量，附官网来源”. Bare product searches and ordinary quote/budget/platform requests retain the catalog route.

The server uses DeepSeek's official `POST https://api.deepseek.com/v1/tools/search`. It reuses `LLM_API_KEY` only when `LLM_BASE_URL` points to the official DeepSeek host. Otherwise configure a separate `WEB_SEARCH_API_KEY`. The key remains server-side. `WEB_SEARCH_TIMEOUT_MS` defaults to 20000 (bounded to 1000–30000). No additional marketplace/SERP account is required.

Each search returns up to five deduplicated public HTTP(S) sources. Answers use the returned summaries, display numbered clickable links, and preserve them in conversation history. No full-page verification is implied. Search summaries never update products or offers; current prices, shipping, and stock require the existing verified quote flow. Empty results and provider failures are reported explicitly.

Search planning uses up to three recent user questions and the previous compared product to resolve follow-up references. Requests are limited to one search per turn, 128 query characters and 1 MB of provider response. URLs in the answer are selected from returned evidence. The default model remains unchanged; thinking is disabled only for search planning and answer generation when using the DeepSeek provider.

Validation: `cd web && npm exec -- tsx --test server/web-search.test.ts server/catalog-chat.test.ts server/langchain.test.ts server/model-search-chat.test.ts`, then `npm run typecheck`. Deployment must overlay the active image and its matching frontend source baseline to preserve unrelated live changes.

Provider reference: https://api-docs.deepseek.com/api/search/

## Deployment evidence — 2026-11-05

- Enabled on `https://picolah.com/7hk9ho`; model remains `deepseek-flash`.
- Local web search, catalog, model-search chat and LangChain suite: 104 passed; after the topic-boundary fix, 83 affected cases passed. Typecheck and the frontend build passed.
- Candidate and production probes: official capacity search, automatic power follow-up, persisted sources, verified catalog prices and timestamps, and topic-switch price clarification passed.
- Final image: `sha256:0ff0c697deada4a8203fc9eaa5ce109de7acd30d6f801b94d4778a192d4a9eef`. Deployment record: `.tmp/deepseek-websearch-20261105/deployment-final.json`.
- Original deployment backup: `/opt/picolah-backups/deepseek-websearch-20261105T092736Z`; final patch backup: `/opt/picolah-backups/deepseek-websearch-20261105T092941Z`. Persistent mounts, crawler container and unrelated runtime files were preserved.
- Public HTTPS probe: 89 catalog entries; new asset SHA matched; live search and conversation reload passed. Test conversation removed. See `.tmp/deepseek-websearch-20261105/public-qa.json`.

2026-11-05 后续更新：商品价格对话已改为全网发现链接后核验商品页；详见 `docs/web-price-search.md`。参数与资料问答继续使用本页描述的带来源搜索回答。

2026-11-05 Fetch 更新：全网商品价格搜索已优先调用 DeepSeek Fetch；信息不足时保留 HTML 核验回退，详见 `docs/deepseek-fetch-price-search.md`。
