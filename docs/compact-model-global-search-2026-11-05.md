# Compact model global price search — 2026-11-05

The exact user input `sonywhch720n` now resolves to Sony WH-CH720N. Search stays global. The release includes brand/model normalization, 30-candidate global discovery with manufacturer-page prioritization, normalized Amazon ASIN links, independently verified same-product variant follow-up, strict product-state/Amazon primary-new-offer parsing, one bounded alternate search after an empty exact-model global search, and the corresponding response count allowance.

No product URL, live price, stock value or search result was hardcoded. Missing or conflicting identity/price/stock evidence remains excluded. Global searches inspect at most 8 pages normally or 12 after the bounded fallback; per-host limit 2, concurrency 3. Different currencies remain separate and shipping stays unknown unless verified.

## Verification

- 51 targeted web tests and 40 crawler tests passed; web and crawler typechecks passed.
- Real candidate and production `/api/chat` checks passed with the original input; catalog remains 89 products and stored offer prices/timestamps were unchanged.
- Public Chrome interaction passed at desktop 1440 px and mobile 390 px, with no page exceptions or horizontal overflow. The saved conversation comparison/reply matched the streamed response. Only QA conversations were removed afterward.
- Public query: 34782 ms; one verified Sony US black offer, USD 89.99, shipping unknown. Seven other sources were unsuccessful, so no global-lowest-price claim is made.
- Verified source: https://electronics.sony.com/audio/headphones/headband/p/whch720n-b

## Deployment

Release: `compact-model-20261105T114709Z`. Backup: `/opt/picolah-backups/compact-model-20261105T114709Z`.

Scoped source/runtime overlay preserved unrelated runtime files, environment and mounts. Both services passed production health and live-query verification. No broad Git reset or checkout synchronization was used.

Artifacts: `.tmp/compact-model-fix-20261105/deployment.json`, `browser-live-qa.json`, `public-frames.json`, `browser-1440.png`, `browser-390.png`.
