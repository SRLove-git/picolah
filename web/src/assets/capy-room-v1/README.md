# Capy's little home

Created with the built-in `image_gen` tool on 2026-11-01. Final generated assets are stored here as WebP (`cwebp -q 86 -m 6`, with `-alpha_q 100` for the transparent resting pose). No image was resized. The existing Picolah character remains the identity reference.

| Asset | Usage |
| --- | --- |
| room-day.webp | Landscape room plate, 1536×1024 |
| room-mobile.webp | Re-composed portrait room plate, 1024×1536 |
| capy-nap.webp | Transparent curled-up resting pose, 1536×1024 |

The application supplies interactive furniture targets, a real progress HUD, day/evening lighting, the animated character, and the journal. No controls or text are baked into the artwork. Interactions do not grant shopping XP or change purchase records.

## Landscape room prompt

Use case: stylized-concept. Asset type: final background plate for an interactive virtual-pet web game, landscape 3:2 composition. Create a beautiful original cozy little home for a golden capybara pet. NO character in the room, the character will be composited live by the application. Premium soft 3D animated-film rendering, tactile matte materials, softly rounded furniture, warm cream and apricot plaster, pale honey oak floor, sage green fabrics, a little dusty rose. Front-facing room with gentle perspective, not isometric, not a cutaway dollhouse. Furnishings stay around the edges with an uncluttered open center: a low tiny sage-green pet daybed and cream pillow at left around x18% y69%; a small round wooden snack table with a shallow pale ceramic bowl of green leaves at right around x80% y69%; a rounded wooden wardrobe with two doors at far right x91% y43%; a big arched wooden window above-left x34% y28% looking onto peaceful green hills and a blue sky, soft linen curtain; one little leafy plant far left; two unobtrusive wooden wall shelves. The wall/floor boundary is near 57% height. A large woven cream oval rug with a faint peach border fills the OPEN center foreground around x52% y80%, completely clear for a character standing there. The open center from x36% to x65%, y35% to y90% must contain no furniture or props. Warm natural daylight from upper left, soft contact shadows and ambient occlusion, polished game-environment quality, inviting but calm, charming scale. All furniture fully visible, no crop at the edges. No text, no labels, no logo, no UI, no icons, no animals, no people, no toy characters, no watermark. Render an immersive room background that fills the entire image, no border, no white margins. Keep the overall palette luminous and soft, avoid excessive pink, avoid dark heavy outlines.

## Portrait room prompt

Use case: precise-object-edit. This supplied image is the environment edit target and visual reference. Create the mobile portrait version of this EXACT cozy virtual-pet room, output a tall 2:3 portrait composition (1024 by 1536 framing), filling the image. Keep the same soft warm 3D render, cream/apricot plaster, honey oak floor, sage sofa, arched window with green hills and lake, linen curtain, plants, round snack table with bowl of green leaves, rounded wardrobe and woven peach-bordered cream rug. Recompose rather than crop: the arched window occupies the upper left, the wooden wardrobe is fully visible on the upper right, the little sage pet sofa sits at lower-left around x18% y65%, the snack table sits at lower-right x82% y67%. Keep a large open central space for an animated character, from x30% to x70% and y40% to y85%, with a clear oval rug centered around x50% y80%. Move the wall/floor boundary to about 59% height. Furnishings should be smaller relative to the room than in the supplied landscape image so they fit the portrait format and leave breathing room. Natural soft daylight, coherent scale and perspective. No character, no people or animals, no text, no logos, no UI, no labels, no border, no letterboxing. It must be a real tall portrait room plate, not a landscape image on a portrait canvas.

Reference: generated landscape room.

## Resting pose prompt

Use case: identity-preserve. Asset type: transparent resting-pose sprite for the same interactive Picolah capybara. Input image is the identity reference and edit target. Preserve this exact fluffy golden-brown capybara identity, rounded snout, warm fur, rainbow unicorn horn, expressive face, beautiful detailed 3D animated-film rendering and warm soft light. Change the full body pose: the capybara is peacefully curled up lying on its belly on a very small soft sage-green oval cushion, eyes fully closed, head resting comfortably on its front paws toward the viewer-left, back rounded, tiny ears relaxed, legs tucked away. The white shopping bag with its pink heart rests beside its back on the right, not held in its paws. Full character and horn fully visible, completely transparent background, no floor or room, no external ground shadow. Wide compact curled silhouette, centered horizontally and vertically with at least 8 percent transparent padding on all sides. No text, no Z letters, no symbols, no extra characters. Maintain the original character rather than making a new species or changing the face.

Reference: `../picolah-capybara-v2.webp`. Transparent output requested and alpha preserved.

