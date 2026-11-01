# Capybara action artwork — 2026-11-01

Generated with the built-in **imagegen** tool in reference-edit mode, with
`transparent_background: true`. Each asset had its own generation call.
Original files were preserved. Final web assets are RGBA WebP, 768 × 804,
converted with `cwebp -q 90 -m 6 -resize 768 804`; no painted-on props or
procedural character reconstruction were used.

## Final files

- `web/src/assets/capy-actions-v1/idle.webp`: empty hands, relaxed standing.
- `web/src/assets/capy-actions-v1/reach.webp`: open paws reaching for bubbles.
- `web/src/assets/capy-actions-v1/snack.webp`: holding and nibbling a lettuce leaf.
- `web/src/assets/capy-actions-v1/wave.webp`: raised paw greeting/dancing.
- `web/src/assets/capy-actions-v1/sleep.webp`: sitting with eyes closed.
- `web/src/assets/capy-clothes-v3/`: six original outfit designs with bags removed.

## Prompt set

### Idle (reference: picolah-capybara-v2.webp)

Use case: identity-preserve. Asset type: transparent game character sprite, full
body. Edit the provided original capybara image into an EMPTY-HANDED RELAXED IDLE
state. Remove the white shopping bag and both pink handles completely. Keep the
SAME capybara: exact broad rounded face and two-lobed brown muzzle, glossy warm
brown eyes, little rainbow spiral horn, pink inner ears, dense fine golden orange
plush fur, cream chin and belly, round pear-shaped body and dark soft toes.
Preserve the original face, smile, head size, three-quarter orientation, lighting,
fur texture, silhouette proportions and camera. Change only the lower arm pose
and bag: two short arms relaxed slightly down beside its belly, both empty paws
clearly visible, reveal the cream belly naturally. Keep head center and feet
groundline matching reference. Same portrait framing, full horn and both feet
visible with transparent margin, one character only. Actual transparent
background, no shadow rectangle, no floor, no text, no bag or purse, no accessories
beyond existing horn. This is a matching sprite, not a character redesign.

### Shared prompt for the four action edits (reference: generated idle PNG)

Use case: identity-preserve. Asset type: transparent full-body game character
sprite matching the provided capybara. Keep this EXACT character identity,
rounded broad head, two-lobed brown muzzle, warm brown eyes, little pastel rainbow
horn, small pink inner ears, fine soft golden fur, cream chin/belly and dark toes,
original plush rendering and lighting. Preserve head size, body proportions and
three-quarter camera view. One character, full horn and feet in frame, actual
transparent background, no text, floor or background. No shopping bag or handles,
no extra clothes.

Appended separately per action:

- **reach:** Change ONLY its arm posture and expression: both short arms reaching
  forwards and slightly upwards with open empty dark paws, as if about to catch a
  floating bubble at upper-chest height. Happy attentive eyes and gentle smile.
  Both feet planted; body and head stay at same place and scale as reference. No
  bubble or prop baked into image.
- **snack:** Eating state: same standing pose and scale; hold one small fresh
  lettuce leaf with both paws near its mouth, nibbling the edge, soft delighted
  expression. Show the tiny leaf clearly and keep the mouth/muzzle anatomy almost
  unchanged. Same head position and groundline, no basket or other prop.
- **sleep:** Resting state: the same capybara SITS on its bottom, hind feet tucked
  forward, forepaws relaxed on cream belly, eyes gently closed, head tilted just
  slightly, cozy sleepy smile. Keep the head's absolute size and facial identity
  from reference, do not turn into a baby or redesign. Shorter seated body
  naturally rests on same groundline. Entire seated body visible, no pillow, no Z
  letters.
- **wave:** Greeting and dance state: same standing body and scale, lift the arm
  on the viewer's right in a friendly wave, rounded dark paw at shoulder level
  facing viewer; other arm relaxed by belly. A cheerful warm smile, lively eyes.
  Keep the original face anatomy and horn exactly. Both feet visible and planted,
  same head location and groundline. No props.

### Clothing (each corresponding capy-clothes-v2 image used as edit target)

Use case: precise-object-edit, identity-preserve. Edit target is this provided
dressed capybara sprite. Remove ONLY the white shopping bag and all pink handles
completely. Naturally reconstruct the garment beneath it, continuing the exact
existing fabric texture, stitching, color and design. Keep both forearms and paws
in their current near-belly positions, empty relaxed paws, lightly curled, no
handles. Preserve EXACT same face, eyes, muzzle, fine golden fur, rainbow horn,
body proportions, original outfit design, head location, feet location, framing,
lighting and resolution. Do not change outfit or facial expression. Full-body
single character with true transparent background; no floor, no shadows rectangle,
no text, no added props. This is a matching bag-free clothing sprite, not a redesign.
