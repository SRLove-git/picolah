# Topic-reference clarification repair — 2026-11-06

After a product lookup followed by an explicit topic switch, a question such as `它多少钱？` still produced conditional historical prices. The tool route had cleared the active comparison, but the planner and reply model could still infer a product from earlier chat text.

## Changes

- Add a clarification action for unresolved product references. Common Chinese/English bare price, stock and retry requests without an active comparison take this path before model inference or search execution.
- Limit intent planning to the current topic, retaining the user message that started it. Normal conversation still receives bounded earlier history so personal names can be recalled.
- Require conversational answers to clarify ambiguous product references when the active comparison is absent; historical prices cannot be used to guess a product across a topic boundary.
- Persist clarification replies normally, without an empty comparison card. Explicit product names and follow-ups inside an active product topic retain their search routes.

## Validation

- Isolated checkout: 306 web tests passed. TypeScript and production build passed (existing bundle-size warning remains).
- Candidate production image: 46 focused regressions and server TypeScript checking passed.
- Candidate and deployed application: 10 acceptance checks each passed.
- Public `https://picolah.com` acceptance: 8 chat requests and 2 actual-model planning checks passed. The history fixture came from the preceding completed live Xiaomi 14 test and was explicitly stored as historical test data; this was not a new price benchmark.
- The exact failure now replies: `你指的是哪款商品？告诉我商品名称或型号，我再帮你查。`
- A longer budget reference outside the deterministic phrase guard also clarified correctly; Chinese/English requests did not search or include old model names/prices. Personal-name memory passed. Explicitly naming Xiaomi 14 and referencing it within an active product topic both selected product search.
- Responses were persisted and readable. All isolated acceptance conversations were deleted.

## Deployment

Release: `topic-reference-clarification-20261106T152426Z`.
Web image: `sha256:f34c651355efed00bea07a9263b437f895c576359e6f20a5446d45be2e7969f0`.

The release overlaid only scoped server files onto the existing image. Environment, SQLite mount, crawler container, frontend build and unrelated runtime files were verified unchanged. Backup and rollback image are recorded under `/opt/picolah-backups/topic-reference-clarification-20261106T152426Z`. Local evidence is retained in `.tmp/topic-reference-fix/` and is not committed.
