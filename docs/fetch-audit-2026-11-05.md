# Fetch configuration and parser audit — 2026-11-05

## Confirmed production configuration

- Search provider: DeepSeek; Fetch provider: DeepSeek; API key configured (value never printed).
- `POST https://api.deepseek.com/v1/tools/fetch`, Bearer authentication, JSON body `{url}`. This matches the current official API reference: https://api-docs.deepseek.com/zh-cn/api/fetch/ .
- Fetch timeout: 12 seconds; HTML fallback: enabled, up to 18 seconds; separate DNS safety timeout; 2 MiB response bound. Three page workers, eight normal page candidates with a bounded twelve-page zero-result retry. Global search does not send localization.
- The official Fetch API returns only title and Markdown content. It does not expose a documented switch for HTML, browser rendering, stock extraction or price extraction: https://api-docs.deepseek.com/zh-cn/guides/search/ . Target-site access restrictions can prevent successful extraction.

## Live sample

Eight directly requested product pages returned title/content through the configured Fetch client; no authentication or timeout failure was observed. Seven contained product content and Galaxus returned an Italian robot challenge. All eight produced zero accepted Markdown quotes in the current parser. This sample is diagnostic, not an estimate of all merchant coverage.

| Site | Observed output | Why a Markdown quote was not accepted |
| --- | --- | --- |
| ALTERNATE | EUR symbol, comma decimals, `Sofort verfügbar` | Parser requires labeled price with ISO code and English/Chinese stock text. A real formatting false negative. |
| OnePhone | `Sold out`, USD/SGD-ambiguous `$`, installment amounts | Stock says sold out; exclusion is appropriate. |
| MobileRelation | A range with mixed condition/storage options | A range cannot identify one available new variant. |
| Xiaomi UK | Selected amount `£899.00`, no H1 or explicit stock | Missing primary-heading/availability evidence. |
| ElectronicsCrazy | `$106.89`, `in Stock` | Bare dollar currency is not explicit; host geography must not invent currency. |
| Sony US | `$89.99`, no H1 or explicit stock | Missing price-currency/availability evidence. |
| Euronics | Repeated identical H1, friend price and regular price | Exactly-one-H1 rule rejects repeated layout; conditional and public amounts require disambiguation. |
| Galaxus Italy | `Sei un robot?`, 100 characters | Source is a robot check. Existing English challenge detection does not classify this language. |

Important discrepancy: the Fetch sample of ALTERNATE showed EUR 837.00, while independent full-HTML product verification during the same audit showed EUR 848.00. The audit does not establish why they differ. Do not relabel the lower value as a current verified price or assume that loosening regex checks makes it correct. The existing HTML fallback continues to supply the independently verified quote.

## Code findings

- `crawler/src/deepseek/fetch.ts`: provider request and credentials are correctly wired. It distinguishes HTTP/provider errors, but challenge-title detection misses some languages. It discards any provider metadata beyond title/content (the documented response contains those two fields).
- `crawler/src/platforms/markdown-product.ts`: one matching H1, a 60-line/6000-character primary block, explicit fixed-format current price/currency and stock are required. Unsupported presentation and missing commercial evidence currently both return `[]` with no structured reason.
- `crawler/src/product-page-reader.ts`: a matching parsed Markdown quote returns immediately. Otherwise it requests HTML once. Logs record `unverified` without identifying heading, price, currency or stock causes. The strict primary path has not independently confirmed a quote in this eight-page sample.
- Broadening presentation parsing should retain exact model/variant, stock and currency checks; prices that conflict across full-page reads must not silently become a claimed minimum. No parser relaxation or configuration change was deployed as part of this audit.

The separate base-edition query fix is deployed and verified; see `base-edition-query-2026-11-05.md`. It addresses the exact screenshot phrase, not universal Fetch coverage.

Raw public page evidence, parsed-output summaries and timings: `.tmp/fetch-audit-20261105/pages/` and `probe.jsonl`. These contain no API keys.
