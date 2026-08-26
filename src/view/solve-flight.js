// The solve "assemble" moment (2026-08-26 polish brief): the four correct tiles pulse,
// then visibly travel into the answer card, instead of vanishing while a card appears
// elsewhere. Presentation only — this module reads no game state and holds none.
//
// Why it exists as its own object: the transit's two measurements live at different
// points in the controller's paint chain. The tiles' origin rects exist only BEFORE
// BoardView mutates the grid; the card's rect exists only AFTER SolvedSetsView creates
// it — and after the grid has lost a row, which shifts everything below. So BoardView
// launch()es (clones lift off, originals leave), SolvedSetsView land()s (clones travel
// onto the measured card), and this object is the transient presentation state carried
// across the gap between the two views. Choreography still falls out of view order.
//
// Same hostage law as motion.js: a failsafe timer removes the clones unconditionally,
// so a throw between launch and land can cost the beat but never litter the screen.

import { EASE, duration, fastDuration, prefersReducedMotion, settled } from './motion.js';

export const FLIGHT = Object.freeze({
  pulseScale: 1.05, // the acknowledgment beat, a touch louder than the hint pulse
  landScale: 0.55, // a tile shrinks to roughly analogy-text size as it lands
  fadeTail: 0.7, // opacity holds through 70% of the travel, then fades into the card
  failsafeMs: 1500 // clones can never outlive the beat, whatever goes wrong upstream
});

/**
 * Where each clone lands: fanned left-to-right across the card in canonical order, on
 * the card's vertical center. Pure — rects in, {dx, dy, scale} out — so the geometry
 * promise is testable headlessly.
 */
export function landingTransforms(origins, target, scale = FLIGHT.landScale) {
  const slot = target.width / Math.max(1, origins.length);
  return origins.map((origin, i) => ({
    dx: target.left + slot * (i + 0.5) - (origin.left + origin.width / 2),
    dy: target.top + target.height / 2 - (origin.top + origin.height / 2),
    scale
  }));
}

export class SolveFlight {
  constructor() {
    this.pendingClones = null;
    this.failsafe = null;
  }

  /** Is a flight mid-air — i.e. should the landing view hide the card and land()? */
  get pending() {
    return this.pendingClones !== null;
  }

  /**
   * Lift off: clone the four tiles in place, hide the originals (BoardView removes them
   * during its reflow), and pulse the clones — the acknowledgment beat. Resolves when
   * the pulse is done; the clones then hover while the grid closes under them.
   *
   * No-ops under reduced motion or without a DOM, leaving nothing pending — land()
   * then resolves instantly and the whole moment degrades to today's instant behavior.
   */
  async launch(tiles) {
    if (prefersReducedMotion() || typeof document === 'undefined') return;
    this.discard(); // a stranded earlier flight must never leak clones

    const clones = tiles.map((tile) => {
      const rect = tile.getBoundingClientRect();
      const clone = document.createElement('div');
      clone.className = 'tile-flight';
      clone.textContent = tile.textContent;
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      document.body.appendChild(clone);
      tile.style.visibility = 'hidden';
      return { clone, rect };
    });

    this.pendingClones = clones;
    this.failsafe = setTimeout(() => this.discard(), FLIGHT.failsafeMs);
    // The acknowledgment pulse rides the FAST dial: the house pulse runs at the slow
    // dial, and this beat sits inside a four-movement chain that must not balloon the
    // fourth solve's run-up to the end screen.
    await settled(
      clones.map(({ clone }) =>
        clone.animate(
          [
            { transform: 'scale(1)' },
            { transform: `scale(${FLIGHT.pulseScale})` },
            { transform: 'scale(1)' }
          ],
          { duration: fastDuration(), easing: EASE }
        )
      ),
      fastDuration()
    );
  }

  /**
   * Touch down: travel every hovering clone onto the card (already in the DOM, hidden,
   * measured by the caller), fading into it over the last stretch. Resolves when the
   * clones are gone; with nothing pending it resolves immediately — the miss path, the
   * reduced-motion path, and every repaint cost nothing.
   */
  async land(cardEl) {
    if (this.pendingClones === null) return;
    const clones = this.pendingClones;
    this.clearFailsafe();
    this.pendingClones = null;

    const moves = landingTransforms(
      clones.map(({ rect }) => rect),
      cardEl.getBoundingClientRect()
    );
    await settled(
      clones.map(({ clone }, i) =>
        clone.animate(
          [
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { opacity: 1, offset: FLIGHT.fadeTail },
            {
              transform: `translate(${moves[i].dx}px, ${moves[i].dy}px) scale(${moves[i].scale})`,
              opacity: 0
            }
          ],
          { duration: duration(), easing: EASE, fill: 'forwards' }
        )
      ),
      duration()
    );
    for (const { clone } of clones) clone.remove();
  }

  /** The failsafe path: remove whatever is hovering, unconditionally. */
  discard() {
    this.clearFailsafe();
    if (this.pendingClones === null) return;
    for (const { clone } of this.pendingClones) clone.remove();
    this.pendingClones = null;
  }

  clearFailsafe() {
    if (this.failsafe !== null) clearTimeout(this.failsafe);
    this.failsafe = null;
  }
}
