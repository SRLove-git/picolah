# Base-edition phone query correction — 2026-11-05

`小米17标准版价格` previously became `Xiaomi 17标准版`. The unrecognized edition text was a mandatory query token, so a base Xiaomi 17 merchant title could not match.

The backend now normalizes standard/base/regular edition wording for explicitly named phone families to their base name. Capacities, colours and budgets remain. Explicit Pro/Ultra/T editions, accessories, negated standard editions and unrelated standard-edition products are not broadened. A standalone standard-edition followup can return a prior named phone to its base edition; retries normalize older failed query text.

Only `web/server/agent/live-query.ts` changed in the production overlay. Crawler code, environment, mounted data and unrelated runtime files were preserved. The crawler container was not restarted.

- 41 query, language and HTTP chat integration tests passed.
- Full web typecheck still reports the same two existing `findLastIndex` / inferred-parameter errors in `server/routes/chat.ts` under the ES2022 lib. An isolated copy with the original live-query file reproduced both errors; evidence is `.tmp/base-edition-20261105/baseline-typecheck.log`.
- Candidate and production API checks passed for the exact screenshot phrase. Public Chrome desktop test passed in 33.4 seconds; this run showed 1 verified quote and disclosed 7 incomplete sources. No browser page errors; persisted answer matched SSE output; QA conversations removed.
- Catalog stayed at 89, and stored offer price/timestamp rows were unchanged.
- Release: `base-edition-20261105T125051Z`. Backup: `/opt/picolah-backups/base-edition-20261105T125051Z`.

Evidence is under `.tmp/base-edition-20261105/`: deployment.json, browser-live-qa.json, browser-1440.png, public-frames.json, tests.log and typecheck logs.
