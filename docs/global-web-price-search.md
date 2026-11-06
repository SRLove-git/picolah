# Global web price search — 2026-11-05

> Historical release record: since 2026-11-06, chat price search defaults to the selected country. See [country-site search](country-site-search-2026-11-06.md) for the current behavior and validation.

Web price searches now send `scope: web, geography: global`. The selected six-country market remains account/catalog context, but does not constrain web search terms, merchant domains, source currencies or the page fetcher's exit country. Explicit platform searches retain their existing market restrictions and platform exclusions still apply to global discovery.

Both search backends omit the country filter in global mode. The page verifier accepts supported ISO currencies and validates precision using each currency's minor units. It still requires a fresh, single, source-bound in-stock product offer. Different model numbers, unverified snippets, ambiguous variants and stale prices remain invalid. International category spellings such as `soymilk`, `soybean milk machine` and `豆浆机` are normalized without changing model/capacity constraints. Explicit ISO expiry timestamps are supported; timezone-less timestamps use the earliest possible UTC instant so the parser cannot extend price validity.

Global results use separate product cards with their original currency codes. They are not passed into the local-market lowest-price ranking. The answer writer and fallback also preserve currency and cannot infer exchange rates, international delivery, taxes or a cross-currency lowest price. If a budget is present, numeric filtering applies only to its market currency; other currencies remain unconverted and their budget eligibility is unknown.

The existing eight-page total, two-pages-per-host and three-worker limits remain. Global means no country restriction, not exhaustive coverage of every website.

Validation evidence is in `.tmp/global-web-search-20261105/`:

- 67 crawler and 48 web tests passed; the chat route suite was rerun after the title change.
- Crawler typecheck passed. Web and isolated frontend source typechecks passed with ES2023 libraries (required by existing `findLastIndex` usage).
- The frontend was built from the previous deployed frontend source baseline. Its original built assets were checked against production before applying the scoped changes.
- Chrome checks at 1440px and 390px verified USD/CNY card labels, the worldwide label, no false SGD formatting or lowest-price ranking, and no horizontal overflow or browser errors.
- Real provider diagnostics retrieved overseas merchant pages. A fresh Yami product page contained a USD 109 single-product offer; the original rejection came from its ISO timestamp expiry. The final live candidate/production/public outcomes are recorded separately by the deployment and verification scripts.

Release acceptance:

- `global-search-20261105T110221Z` passed isolated candidate and production chat checks. The public HTTPS query `全网搜索九阳豆浆机价格` subsequently returned two product-page-verified offers: Yami USD 109 and desertcart.in INR 28,582 (different models). Both retain unknown shipping/discounts. Six other pages remained unverified; the answer does not claim complete coverage or a cross-currency lowest price.
- Streamed and saved answer/comparison parity passed, and test conversations were removed. The catalog stayed at 89 products with unchanged offer prices/timestamps.
- Public frontend assets matched the scoped build. Desktop/mobile Chrome rendering passed with mixed-currency fixtures.
- `global-composer-20261105T110658Z` removed the lingering market-specific composer placeholder in Chinese and English. This follow-up changed only frontend assets and the two source strings; backend/crawler, environment and mounts were preserved.
- The final public bundle hash matched the release. Chrome then rendered the captured live USD/INR result on the deployed frontend at 1440px in English and 390px in Chinese, including the worldwide label and corrected composer placeholder; both passed without overflow or browser errors. These rendering checks replayed the independently verified public API response rather than issuing another paid search.
- Production rollback/source/database snapshots are in the corresponding release folders under `/opt/picolah-backups/`.
