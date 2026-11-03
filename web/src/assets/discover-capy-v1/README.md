# Discover product try-on illustrations

Generated with the built-in `image_gen` tool in edit / identity-preserve mode.
The edit target was the approved `../capy-actions-v1/idle.webp` mascot. The full
prompt set is in [PROMPTS.json](./PROMPTS.json).

The 26 transparent WebP scenes show Pico wearing headphones, earbuds, a watch
and sneakers, holding small products, or using the corresponding home appliance.
They are category illustrations, not photographs or exact visual representations
of individual SKUs; Discover retains its existing localized Illustration label.
Product names, specifications and comparison targets still come from the catalog.

Runtime assets are 640 px high, compressed with `cwebp -q 84 -m 6`, retaining
alpha. The generated PNG masters are preserved in the Codex generated-images
cache; these optimized project files are the production deliverables.

`discover-art.ts` resolves specific appliance kinds before falling back to the
catalog visual, since existing vacuum, purifier and iron records share the
legacy `airfryer` value, and kettles share `coffee`. New unrecognized visual values
use the neutral approved mascot. Keep that distinction when adding products.

`DiscoverProductArt.tsx` uses ordinary image elements, eagerly loads the first
four cards, lazily loads the rest, and falls back to the neutral mascot on image
failure. No WebGL instances or continuous animations are created in the grid.
