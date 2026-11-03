# Discover: product-specific capybara scenes

58 transparent WebP scenes, one per catalog product ID. Generated on 2026-11-03 with the built-in imagegen tool in **edit** mode, using both the approved `capy-actions-v1/idle.webp` mascot and the matching real product photograph as references.

`DiscoverProductArt.tsx` resolves the exact product ID. No category fallback is used: an unknown product retains the neutral mascot until its own reference-based scene is available. Catalog prices, availability and comparison behavior are independent of these illustrations.

## Source and regeneration records

- `SOURCES.json`: the exact source page, product photograph URL, selected variant, original photograph SHA-256 and shipped artwork SHA-256.
- `PROMPTS.json`: the full per-product edit prompt, reference inputs and transparency setting.
- WebPs are resized proportionally to 680 pixels high with `cwebp -q 84 -m 6`. They retain alpha transparency and average about 58 KB each.

Photographs were selected from the matching official brand pages or previously captured product-detail records. Variant selection is explicit where necessary: Sony WH-1000XM5 black, Bose QuietComfort Ultra black, Xiaomi Essential 6L, iPhone 16 Pro natural titanium (second phone in the reference lineup), and Apple Watch SE 2 GPS midnight. Photo verification is for visual identity only, and does not establish a current price or stock status.

Wearables are worn, handheld products are held, and appliances appear in their appropriate use pose. Generated artwork is an illustration; fine lettering is not a replacement for the original merchant photograph. Keep the existing illustration marker in the product cards.

## Verification

All 58 current catalog IDs have a unique asset and matching provenance/prompt record. All scenes were visually compared with their product photographs in an eight-page reference gallery. Checks cover model silhouette, color, brand marks, camera arrangement, controls, straps, handles and other distinguishing features. Product-card layout is checked separately at desktop and narrow mobile widths before release.
