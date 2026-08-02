// Solved set cards. READ-ONLY — renders solvedSetIds in solve order, emits nothing.
//
// This is the ONLY place tier colors exist. The card shows the canonical ordered analogy
// (Bree Serif) and the italic relationship label — the tier is revealed here, on solve,
// and nowhere earlier. difficultyToTier is a pure derivation, not an engine mutator, so
// importing it keeps the boundary law intact.

import { canonicalOrder } from '../engine/arrangements.js';
import { difficultyToTier } from '../engine/tiers.js';

export class SolvedSetsView {
  constructor(root) {
    this.root = root;
    this.cards = new Map(); // setId → card element, persistent like board tiles
  }

  update(state) {
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
      this.root.appendChild(card);
    }
  }
}
