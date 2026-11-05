# Short product names in global price search — 2026-11-05

The production query `小米17` now returns verified Xiaomi 17 product-page quotes instead of exhausting all eight pages on news, mixed models or unreadable sources.

## Changes

- Global searches without a full alphanumeric model code express purchase intent; established short phone families also include the smartphone category. No country is added.
- Candidate ranking applies to short product names as well as full model codes. Product paths rank ahead of editorial pages; merchant product pages mentioning customer reviews remain eligible.
- A zero-quote global search can make one additional search without a model-code hint or six-page minimum. Maximums remain two searches, twelve page reads, two pages per host, three concurrent reads and one linked-page hop.
- Chinese brand aliases and brand-prefixed identities support merchants that publish `name=17` and `brand=Xiaomi` separately. The displayed title also retains the explicit brand.
- Standard 17 does not match 17T, Redmi Note 17, Pro, Ultra, mixed generations, accessories, refurbished or explicit preorder/backorder identities. Range prices, unknown stock and failed page reads remain excluded.

DeepSeek Search and Fetch remain primary. Insufficient Fetch content still triggers the existing bounded Bright Data HTML fallback. In this verification both successful quotes required the HTML fallback; this is not a claim that Fetch alone verified them.

## Verification

- 48 focused crawler tests passed; crawler TypeScript check passed.
- The broader discovery suite remains at 13/15: its same two pre-existing Amazon fixture failures were reproduced before this change. Their baseline is `.tmp/deepseek-fetch-20261105/baseline-discovery-tests.log`.
- Candidate API, production API and public Chrome desktop chat all passed with the exact input `小米17`.
- Public UI run took 22.8 seconds, checked eight sources and verified two. Both result cards show original EUR amounts and source links. Six remaining source failures are disclosed in the answer.
- Observed quotes: ALTERNATE EUR 848.00 and Galaxus Italy EUR 1,013.48. These are the prices observed during verification, not fixed prices or a guarantee of the lowest price across the entire web. Shipping and delivery eligibility remain unverified.
- Chat persistence matched the SSE answer and comparison; browser recorded no page errors. Test conversations were deleted.
- Catalog count stayed at 89; stored offer amounts/timestamps, mounts, environment and unrelated runtime files were preserved.

## Release

Production release: `xiaomi-17-20261105T124122Z`. Scoped overlay changed three crawler runtime files. Fresh runtime/source hashes and image IDs were checked before applying it; rollback images and the SQLite backup are under `/opt/picolah-backups/xiaomi-17-20261105T124122Z`.

Evidence: `.tmp/xiaomi-17-20261105/deployment.json`, `browser-live-qa.json`, `public-frames.json`, `browser-1440.png`, `tests.log`, `typecheck.log` and `discovery-tests.log`.
