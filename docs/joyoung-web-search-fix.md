# Chinese appliance web search — 2026-11-05

The request `全网搜索九阳豆浆机价格` previously sent untranslated Chinese terms to Singapore web discovery. Candidate pages included discussion posts and reviews, while a useful merchant brand directory was never followed to its product detail page.

The search language dictionary now maps 九阳 to Joyoung and 豆浆机 to soy milk maker, preserving supplied model, capacity and budget constraints. Discovery prioritizes domains for the selected market, filters obvious social/forum/article URLs, and can follow one level of matching product links from a merchant page. Links must remain on the same origin and pass the existing safe-URL and product-identity checks. Every quote still requires current product-page verification; directory text and search snippets supply no prices.

The total budget remains eight page requests, at most two per host and three concurrent requests. Two slots are reserved for product links found on the initial pages; unused slots return to the original candidates. Followed pages cannot trigger another crawl level. Failure coverage is appended only when there are matched results; failed-search answers explain the failure once.

Validation:

- 34 crawler and 66 web regression tests passed, including directory traversal, identity/origin restrictions, page budgets, query translation and failure-copy behavior.
- Crawler typecheck passed. The web typecheck passed with ES2023 libraries; the repository's existing ES2022 configuration still reports the unrelated `Array.findLastIndex` use in `server/routes/chat.ts:70`.
- A captured merchant directory selected the actual product URL through the new link parser.
- Isolated candidate and production chat checks both used the exact Chinese request and returned a freshly verified Joyoung DJ03E-A1soloE 300ml offer from ElectronicsCrazy, SGD 106.89. Shipping and discounts remained unknown. This verifies one current offer, not a lowest-price or complete-market claim.
- Tests confirmed streamed answers and comparison data were saved correctly, then removed their own test conversations. The 89-product catalog and stored offer prices/timestamps remained unchanged.

Release: `joyoung-search-20261105T102447Z`. Only seven backend/shared source files were overlaid onto the active production images; frontend assets, unrelated runtime files, mounts and environment were preserved. Rollback images and source/database snapshots are under `/opt/picolah-backups/joyoung-search-20261105T102447Z`.

Local evidence is under `.tmp/joyoung-search-fix-20261105/`. Public HTTPS API verification also passed with the exact Chinese request: the same offer was freshly checked at `2026-11-05T10:27:44.488Z`, and persisted response/comparison parity passed. See `public-qa.json`. Browser rendering was not part of this backend validation.
