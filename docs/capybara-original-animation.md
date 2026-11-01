# Reference-image capybara animation

The room uses transparent artwork derived from the approved
`web/src/assets/picolah-capybara-v2.webp`. It has five bag-free poses: relaxed
idle, reaching, eating a leaf, waving and seated sleep. See
[asset prompts and provenance](capybara-action-art.md).

`capy-action-art.ts` maps interactions to sprites and stores the visible paw
positions for each pose. The continuous meshes keep their UV coordinates fixed;
existing clips provide breathing, ear movement, chewing, leaning and small limb
movements. An 180 ms dissolve transitions between prepared poses. Contact points
follow the same deformations and transition as the visible paws. Ball and bubble
contacts keep their existing physical radii.

The six complete fitted outfits have bag-free versions. They retain their fitted
standing pose during interactions, with the existing continuous motion; the five
full-body pose variants are the unclothed character set. Clothing is never
silently removed to show an action. Bag charms intentionally select the original
shopping artwork, including the corresponding original dressed sprite, so the
charms retain their bag support. Other accessories follow the pose's anchors.

Texture loads are cached and versioned: a slow earlier pose or outfit cannot
replace the latest selection. A later texture failure retains the current
visible character. Only the small action set preloads; outfits load as selected.
GPU context restoration reuses textures, and disposal releases textures,
geometries and materials, including late image results.

Pause, reduced motion, background tabs and dialogs use the existing room gates.
Reduced motion settles directly into the selected pose. Loading and unsupported
WebGL share the new static artwork. The shadow receiver does not write depth, so
it cannot cut off a seated sprite's feet. The camera retains the source artwork's
three-quarter view; the character is image puppetry, not a replacement 3D mesh.
