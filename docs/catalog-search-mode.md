# Product library search

Set `PRODUCT_SEARCH_SOURCE=catalog` in the API environment to serve chat searches
from the existing products and offers database. The Docker Compose service reads
this value from `.env`; recreate only `picolah` after changing it.

Catalog mode does not invoke the on-demand crawler, including for missing models
or empty results. It preserves market, platform and landed-price budget filters,
as well as follow-up queries. Product identification uses the existing strict
model/variant matcher; broad category searches return matching catalog products.

Catalog searches display the latest stored offer for each listing while it is
marked in stock, including offers last checked more than 24 hours ago. Each
quote retains its original collection time, market and currency. Demo and seed
rows are excluded. A later import updates the listing's price and stock status.
`OFFER_FRESHNESS_HOURS` applies to stored offers read in live mode.

Image recognition and grounded answer generation may still use the configured
language model. No background crawler or ingestion schedule is changed by this
setting. Set `PRODUCT_SEARCH_SOURCE=live` to restore on-demand marketplace search.
