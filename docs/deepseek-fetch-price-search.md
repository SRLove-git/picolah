# DeepSeek Fetch for global price search — 2026-11-05

> Historical release record: since 2026-11-06, chat price search defaults to the selected country. See [country-site search](country-site-search-2026-11-06.md) for the current behavior and validation.

Global product discovery still uses DeepSeek Search. Product-page reads now prefer DeepSeek Fetch (`POST https://api.deepseek.com/v1/tools/fetch`). The original `sonywhch720n` input, global geography, exact model checks and original currencies remain intact.

## Configuration

- `PRICE_FETCH_PROVIDER=deepseek`
- `PRICE_FETCH_FALLBACK=true`
- Existing server-side `WEB_SEARCH_API_KEY` / permitted `LLM_API_KEY` reuse supplies authentication.
- To roll back the provider alone, set `PRICE_FETCH_PROVIDER=brightdata` and recreate the crawler service. Restore the release backup for a full rollback.

A complete primary-product Markdown block can supply a quote only with a matching product heading, one unambiguous current price, explicit currency, and explicit in-stock evidence. Reviews, list prices, recommendations, installment/conditional prices, conflicting variants and bare `$` amounts cannot fill missing fields. Model/color/budget checks run afterward and no fetched content is treated as an instruction.

If Fetch fails or cannot establish the quote, one Bright Data HTML request may follow. The existing strict HTML and selected-SKU stock checks remain active. Providers' prices and inventory are not combined to manufacture an offer. Valid Markdown directory links can still discover same-site product pages when HTML is unavailable. Platform-specific discovery remains separate; this change applies to the global/web price-search path.

Fetch uses public-URL/DNS validation, a fixed API endpoint, sanitized error codes, bounded response bodies and request timeout. HTTP 200 challenge/busy responses are rejected. A page attempt uses up to 12 seconds for Fetch and 18 seconds for the HTML fallback, with separate DNS validation limits. Existing 8-page normal / 12-page fallback budgets and three workers remain. Requests now count both provider attempts. Provider activity is recorded in server logs, without API keys or page text.

## Validation and deployment

- 70 focused provider, parser, fallback, URL, discovery and HTML regressions passed. Crawler typecheck passed.
- Two broader `discovery.test.ts` marketplace-fixture failures also reproduce in the unchanged pre-switch source snapshot; they are recorded in `.tmp/deepseek-fetch-20261105/baseline-discovery-tests.log` and were not attributed to this release.
- Candidate and production real chat checks passed for `sonywhch720n`. Production provider logs recorded 8 DeepSeek Fetch attempts and 8 HTML fallbacks. The Sony page's Markdown exposes a price but lacks explicit currency/stock evidence, so that quote still needs HTML verification.
- Verified result: Sony WH-CH720N black, USD 89.99, shipping unknown. Other failed sources are reported as incomplete coverage.
- Catalog remains 89 products; stored offer prices and timestamps were preserved. QA conversations were removed afterward.
- Release: `deepseek-fetch-20261105T121735Z`.
- Backup: `/opt/picolah-backups/deepseek-fetch-20261105T121735Z`.
- Both containers were healthy; unrelated runtime files, environment values and mounts were preserved. Only the two declared Fetch settings changed.

Evidence: `.tmp/deepseek-fetch-20261105/deployment.json`, `focused-tests.log`, `browser-live-qa.json` and `public-frames.json`.

API reference: https://api-docs.deepseek.com/zh-cn/api/fetch/
