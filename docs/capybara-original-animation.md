# Original mascot animation

The room uses the unchanged `web/src/assets/picolah-capybara-v2.webp` as its
character. The procedural 3D replacement has been removed. The mesh moves the
original pixels without regenerating the face, recolouring the fur or revealing
an invented back view. Materials bypass scene tone mapping so the artwork
keeps its own colours.

The existing motion clips supply breathing, ear movement, head tilts, chewing
and settling. Walking, kicks and short reaches deform a continuous image mesh;
UV coordinates remain fixed. The exact same deformation drives the visible-paw
contact points used by the ball and bubble simulation. Bubbles are placed within
the original folded-paw pose's reach, without enlarging the hitboxes.

The original complete dressed artwork supplies each of the six outfits. Smaller
accessories share the established wardrobe placements and deform with the same
image. Loading is versioned so a slow earlier outfit cannot replace a later
selection. GPU context recovery reuses the image textures; disposal releases all
loaded textures, including requests that finish after unmount.

Pause, reduced motion, hidden tabs and open dialogs use the existing room gates.
The original artwork remains visible while the renderer loads or recovers. The
room camera always sees the source's original three-quarter view. This is image
puppetry; it does not fabricate new camera angles or redraw unseen anatomy.
