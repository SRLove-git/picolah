# Fetch parsing and price disagreement handling — 2026-11-05

The global reader now distinguishes parsed Fetch evidence from a quote accepted after full-page verification. It no longer chooses one of two conflicting prices.

## Parsing

- Recognizes explicit EUR/GBP/INR symbols, ISO currencies, prefix/suffix currency, decimal-comma/grouped amounts, split price labels, and additional exact stock phrases including German.
- Accepts repeated identical H1 headings and a matching H2; rejects different identities and duplicate product blocks outside the primary section.
- Keeps only the explicit public regular price when a member/friend price is also displayed. Original/list prices, shipping and installment amounts do not become the item price; old-price minus savings must agree with the current amount when both are present.
- Bare `$` still requires a compatible explicit currency declaration. Missing stock, sold-out/preorder products, ambiguous variants, unknown currency and contradictory amounts remain excluded.
- Recognizes additional robot-challenge titles and records specific parsing reasons in provider events without logging credentials or page text.

## Corroboration

With the existing `PRICE_FETCH_FALLBACK=true`, a parsed Fetch offer gets one bounded HTML read as corroboration. Amount/currency disagreements raise `PRODUCT_PAGE_PRICE_CONFLICT`; conflicting model/storage/color raises `PRODUCT_PAGE_IDENTITY_CONFLICT`. Neither amount is returned on conflict. An unverified HTML response is not replaced with a Markdown price. The global search keeps unrelated verified results and can make its existing bounded second search if no quotes survive.

All comparisons use the original URL and currency. No fields are combined across providers, and the existing page/host/concurrency budgets remain. Explicitly disabling fallback still selects the Fetch-only mode; no environment setting was changed.

## Observed results

- 54 focused crawler regressions passed; crawler typecheck passed.
- Replay of the original eight saved pages produced two parsed candidates instead of zero. This is parser coverage, not a claim of two verified current quotes.
- Real candidate and production chat tests identified the ALTERNATE disagreement (Fetch EUR 837.00 versus HTML EUR 848.00) and excluded that page.
- Public Chrome desktop test of `小米17标准版价格` passed in 38.2 seconds and displayed Galaxus Italy EUR 1,013.48. The conflicting ALTERNATE quote was absent. Remaining source failures were disclosed; shipping remained unknown.
- Chat persistence matched the stream, no browser page errors occurred, and QA conversations were removed. Catalog remained 89 with stored offer amounts/timestamps unchanged.
- Release: `fetch-fix-20261105T133250Z`. Backup: `/opt/picolah-backups/fetch-fix-20261105T133250Z`. Only four crawler files were overlaid; production web container, environment, mounts and unrelated files were retained.

Evidence: `.tmp/fetch-fix-20261105/` contains the deployment, saved-page replay, focused tests and public browser report/screenshot. Merchant blocking and pages without explicit variant/stock/currency evidence still limit coverage; the fix does not claim universal web coverage or a global lowest price.

## Final timeout safeguard

When HTML corroboration is enabled, its network timeout, unavailable configuration or source error cannot revive an otherwise parsed Markdown price. Only incomplete Markdown may remain available for safe same-site link discovery. This avoids treating a failed corroboration as a confirmation.

Final release: `fetch-corroboration-20261105T134830Z`; backup: `/opt/picolah-backups/fetch-corroboration-20261105T134830Z`. The same 54 focused tests and crawler typecheck passed; isolated candidate and production API tests passed. Only the crawler container was replaced. Final evidence is under `.tmp/fetch-corroboration-20261105/`.

## Bounded transient retry and final deployment

A subsequent public-page check exposed an intermittent `WEB_PAGE_TIMEOUT` on the remaining verified merchant. A direct diagnostic read succeeded, so the global discovery now shares a budget of two short HTML transport retries across the complete search. Each page can retry at most once for eight seconds after timeout/network failure. Conflicting prices, stock/identity failures, source refusals and security errors never retry. Every provider attempt is included in request accounting. Logical page/host/concurrency budgets remain unchanged; total provider attempts can increase by at most two.

The final release is `fetch-retry-20261105T135401Z`; backup `/opt/picolah-backups/fetch-retry-20261105T135401Z`. 56 focused tests and crawler typecheck passed. Candidate and production API checks passed for `小米17标准版价格`, returned the independently verified Galaxus quote and excluded the conflicting ALTERNATE quote. Production web container, environment and catalog were preserved.

Final evidence: `.tmp/fetch-retry-20261105/deployment.json`, tests.log, typecheck.log and browser verification files. Earlier candidate/browser failures caused by source timeouts are retained in `.tmp/fetch-corroboration-20261105/`; they are not counted as passing acceptance.

Final public Chrome desktop acceptance passed in 34.1 seconds. The exact screenshot phrase returned one verified quote, disclosed seven incomplete sources, preserved the saved comparison, and recorded no browser page errors. The conflicting merchant was absent. QA conversation cleanup completed.
