# Shopping follow-up conversation repair — 2026-11-07

The website interpreted “换一个呢” after an HCG product result as a new product query, appending literal `alternative` / `alternative brand` to the previous name. Failed lookups then produced another quotation failure instead of continuing the conversation. Follow-up requirements also lost the user's preference to discuss first, and ordinary replies could prematurely truncate the active topic.

## Behavior

- Ambiguous requests to change an item ask one contextual question about changing the brand/product or merchant. They do not run a literal “alternative” product search.
- A short answer such as “换品牌” is retained as the user's choice. The next reply acknowledges it without repeating the brand-versus-merchant question.
- “先聊需求 / 先别搜索” persists in existing assistant-message metadata. Budget, usage and feature preferences continue the discussion, including after reopening the conversation. An explicit lookup request can resume price search.
- Topic detection runs even when tools are prohibited. Switching from HCG to phones clears the previous product for reply generation; the current question is placed after historical context. Personal conversation history remains available.
- Normal conversation creates no comparison results. Existing country-specific, product-page-verified price lookup remains the search path.

## Validation

- Isolated web suite: 308 tests passed. TypeScript and production build passed (the existing large-bundle warning remains).
- Working-copy integration checks: 41 focused conversation/search tests passed; TypeScript passed after merging only these scoped changes into the otherwise dirty workspace.
- Final candidate and production API checks: 13/13 each, consisting of 11 multi-turn response checks and two actual-model planner checks. These verify the reported historical conversation, brand choice retention, discussion preference, explicit lookup routing, topic switches and unresolved references. Both runs cleaned up their isolated conversations.
- Live image regression gate: 48/48 tests and server TypeScript checks passed. An initial candidate was rejected before activation because its overlay omitted existing platform defaults; the final overlay preserves those defaults.
- Public Chrome acceptance at `https://picolah.com/7hk9ho`: 9/9 rendered chat turns passed, including a reloaded conversation and an HCG-to-phone topic switch. No comparison-result events or page exceptions occurred. Both isolated browser conversations were deleted successfully.
- A response-content check was added after finding that a correct topic-switch flag alone did not prevent an old-brand reply. The final release passes both the state assertions and the visible reply assertions.

## Scope

Seven application/test files changed. Conversation state uses existing JSON message metadata; no database migration was required. Deployment overlays only changed server/shared files on the current live image. The crawler, frontend assets, environment and persistent mounts are retained. Historical records are copied into isolated QA conversations, which are deleted after testing; real user conversations are not edited.

This is a conversation-routing acceptance check, not a new product-price retrieval benchmark. The live checks include planner assertions rather than new price searches.

## Final release

- Release: `conversation-reply-topic-20261106T165326Z` (UTC timestamp; 2026-11-07 in Asia/Shanghai).
- Web image: `sha256:872eb194c9c1ce1be276ada00027b247bef9b52ebad2fa39921e0a48199fb523`.
- Web and crawler health: healthy; public `/api/health` reports SQLite healthy and the LLM configured.
- Existing crawler image, environment, persistent mounts and unrelated runtime/frontend files verified unchanged by the guarded deployment.
- Server evidence and rollback snapshot: `/opt/picolah-backups/conversation-reply-topic-20261106T165326Z`.

Representative public-browser replies:

> 换一个呢 → “你是想换一个品牌的早孕检测，还是同一款换一家商家？”
>
> 换品牌。 → “好，换品牌。早孕检测你想优先看哪类品牌……”
>
> 我想换手机，先聊聊需求，不急着查价格。 → “好，先聊手机需求，不查价格。”
