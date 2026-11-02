# Product library search

Set `PRODUCT_SEARCH_SOURCE=catalog` in the API environment to serve chat searches
from the existing products and offers database. The Docker Compose service reads
this value from `.env`; recreate only `picolah` after changing it.

Catalog mode does not invoke the on-demand crawler, including for missing models
or empty results. It preserves market, platform and landed-price budget filters,
as well as follow-up queries. Product identification uses the existing strict
model/variant matcher; broad category searches return matching catalog products.

Quotes must be in stock, in the current market/currency and inside the existing
`OFFER_FRESHNESS_HOURS` window. Sources `seed` and `picolah-mock` are excluded.
Stored collection times are preserved. Missing or expired quotes are reported as
unavailable in the catalog, not as proof that merchants have no stock. Empty
results do not fall back to a provider search.

Image recognition and grounded answer generation may still use the configured
language model. No background crawler or ingestion schedule is changed by this
setting. Set `PRODUCT_SEARCH_SOURCE=live` to restore on-demand marketplace search.
