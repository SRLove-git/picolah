# Conversational routing repair — 2026-11-06

The reported country correction was being treated as a product query. The production record for the supplied screenshot contains `我要在 的 你怎么不是` as both the search query and model. That request was created at 13:09 UTC, before the earlier country-filter release, but the conversational routing defect remained reproducible afterward.

## Changes

- Classify each text turn as a conversational reply, a product lookup, or a factual web lookup. Only lookup intents execute search tools. Images retain product recognition.
- Replace the shopping-only chat prompt with normal conversation, explanations, writing and translation. Replies receive bounded recent history and the previous verified search outcome, with current country separated from historical search scope.
- Persist whether a reply continues the active product context. Explanations and acknowledgements can be followed by retries or country changes; unrelated topics clear ambiguous product reuse.
- Resolve the Singapore correction against the preceding product rather than searching the complaint. Preserve parsed and inherited budgets when resolving a query, without copying a budget to a different explicit product.
- Conversational replies do not emit empty comparison cards or record a new comparison. They do not claim to have searched, fabricate quotes, or infer product unavailability from failed retrieval.
- Stop presenting the failed-request counter as a count of independent merchants. Keep internal error codes out of the ordinary conversation payload.

## Validation

- Merged local workspace: 37 focused chat tests and TypeScript passed while retaining unrelated local edits.
- Isolated GitHub checkout: 304 web tests passed; TypeScript and production build passed. Build retains the existing large-bundle warning.
- Production overlay: 153 relevant tests passed before the initial release; the budget/payload follow-up passed 43 focused tests and TypeScript checking.
- Actual configured model: 14 intent cases and 3 conversational answers passed in both candidate and production. Follow-up changes passed 3 focused live checks in both environments. These small deterministic scenarios establish the observed behavior, not a general model accuracy rate.
- Existing production catalog tests included an obsolete expiration assertion. Its expectation was synchronized with the already-committed catalog policy test; catalog runtime behavior was not changed in this release.

## Public HTTPS acceptance

Eight consecutive turns through `https://picolah.com/api/chat` passed. Assistant replies were persisted and readable through the conversation API; all test conversations were then deleted under the isolated test identity.

| Turn | Observed behavior | Total time |
| --- | --- | --- |
| Capabilities question | Conversational reply; no product-search results event | 2.78 s |
| Give preferred name | Conversational reply; no product-search results event | 1.74 s |
| Recall preferred name | Conversational reply; no product-search results event | 1.69 s |
| Translate a sentence mentioning a phone | Conversational reply; no product-search results event | 2.12 s |
| Explain opportunity cost | Conversational reply; no product-search results event | 1.30 s |
| Search Xiaomi 14 | SG; Xiaomi 14; SGD 669 page price; out of stock; fresh lookup | 126.24 s |
| Explain the preceding result without searching | Conversational reply; no product-search results event | 1.87 s |
| Correct the country to Singapore | SG; Xiaomi 14; SGD 669 page price; out of stock; disclosed cache hit | 2.73 s |

The three returned variants share one retailer/product URL, so they are not three independent merchant sources. This is a conversational-routing acceptance test, not a new multi-product price-success-rate benchmark. Live product lookup remains slower than conversation (about 126 seconds in this sample); ordinary replies completed in 1.3–2.8 seconds.

## Deployment

Initial release: `conversation-routing-20261106T144818Z`.
Final release: `conversation-budget-context-20261106T145500Z`.
Final web image: `sha256:0976ab6926278a03bc0280124ac7ff65dfb439e60b29d386f28df62f9e1e1c5b`.

Only the changed server/shared files were overlaid onto the running web image. Container environment, SQLite mount, crawler container, frontend build and unrelated runtime files were verified unchanged. Each deployment has a rollback image and a source backup under `/opt/picolah-backups/`.

Local evidence is retained under `.tmp/conversation-routing/` (not committed); no credentials or production conversation identifiers are included in this report.
