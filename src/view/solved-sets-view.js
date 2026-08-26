// Solved set cards. READ-ONLY — renders solvedSetIds in solve order, emits nothing.
//
// This is the ONLY place tier colors exist. The card shows the canonical ordered analogy
// (Bree Serif) and the italic relationship label — the tier is revealed here, on solve,
// and nowhere earlier. difficultyToTier is a pure derivation, not an engine mutator, so
// importing it keeps the boundary law intact.

import { canonicalOrder } from '../engine/arrangements.js';
import { difficultyToTier } from '../engine/tiers.js';
import { settleIn } from './motion.js';

export class SolvedSetsView {
  constructor(root, flight = null) {
    this.root = root;
    this.cards = new Map(); // setId → card element, persistent like board tiles
    this.flight = flight; // the solve transit's landing half — presentation only
  }

  async update(state) {
    // Play again starts a fresh game: drop cards belonging to a run that is over.
    if (state.solvedSetIds.length === 0 && this.cards.size > 0) {
      this.root.innerHTML = '';
      this.cards.clear();
    }

    for (const setId of state.solvedSetIds) {
      if (this.cards.has(setId)) continue;

      const set = state.puzzle.sets.find((s) => s.id === setId);
      const [a, b, c, d] = canonicalOrder(set.pairs);
      const tier = difficultyToTier(set.difficulty);

      const card = document.createElement('div');
      card.className = 'solved-card';
      card.dataset.tier = tier;

      const badge = document.createElement('span');
      badge.className = 'tier-badge';
      badge.textContent = tier;

      const analogy = document.createElement('div');
      analogy.className = 'analogy';
      analogy.textContent = `${a} : ${b} :: ${c} : ${d}`;

      const relationship = document.createElement('div');
      relationship.className = 'relationship';
      relationship.textContent = set.relationshipLabel;

      card.append(badge, analogy, relationship);
      this.cards.set(setId, card);

      // When a flight is mid-air (2026-08-26 polish brief), the card enters hidden so
      // it can be measured, the clones travel onto it, and the unhide IS the reveal —
      // the tiles become the card, not a card appearing beside a vanish. With nothing
      // pending (miss repaints, reduced motion, no flight wired) land() resolves
      // instantly and the card settles in exactly as before.
      if (this.flight?.pending) {
        card.style.visibility = 'hidden';
        this.root.appendChild(card);
        await this.flight.land(card);
        card.style.visibility = '';
      } else {
        this.root.appendChild(card);
        await settleIn(card);
      }
    }
  }
}
