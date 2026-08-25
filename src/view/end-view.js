// The end screens. READ-ONLY — renders the finished game, emits share/play-again intents.
//
// Win:  every set in tier order, with its explanation. Share + Play again.
// Loss: every set in tier order too, but the ones the player never got carry a REVEALED
//       badge — GDD §8.2 wants the loss to stay educational and fair.
//
// Both screens show the canonical ordered analogy regardless of which accepted order was
// confirmed, because relationship labels are directional.

import { canonicalOrder } from '../engine/arrangements.js';
import { difficultyToTier } from '../engine/tiers.js';
import { drop } from './confetti.js';
import { settleIn, staggerStep } from './motion.js';

export class EndView {
  constructor(root, { onShare, onPlayAgain, onPours }) {
    root.innerHTML = `
      <h1 class="end-title"></h1>
      <p class="end-score"></p>
      <div class="end-sets"></div>
      <!-- The survey mount (D-21): below all the set reveals, above the actions — Max's
           placement call. This view only provides the slot; whether a survey lives in it
           is decided in app.js, and the SurveyView renders it. -->
      <div class="survey" hidden></div>
      <div class="controls end-actions">
        <button class="pill" data-action="share">Share</button>
        <button class="pill" data-action="play-again">Play again</button>
        <!-- Ink fill is reserved for the one primary action, and after a finished board
             that is moving on. The daily loop's "on" is the calendar: yesterday's board,
             or the knowledge that tomorrow brings a new one (D-24 — "Next puzzle"
             retired with the list it walked; "Past Pours" retired as a label at Max's
             review, since the calendar is the main door now, not strictly an archive). -->
        <button class="pill primary" data-action="pours">Puzzles</button>
      </div>
      <p class="share-feedback" role="status" aria-live="polite"></p>
      <!-- Deep-linked visitors never see the title screen (D-20 routing), so this is
           the one surface where a stranger can learn how the puzzles are made. -->
      <a class="text-action" href="about.html">About this game</a>`;

    this.titleEl = root.querySelector('.end-title');
    this.scoreEl = root.querySelector('.end-score');
    this.setsEl = root.querySelector('.end-sets');
    this.feedbackEl = root.querySelector('.share-feedback');
    /** Handed to app.js, which mounts the SurveyView here (or leaves it hidden). */
    this.surveyMount = root.querySelector('.survey');
    this.renderedFor = null;

    root.querySelector('[data-action="share"]').addEventListener('click', onShare);
    root.querySelector('[data-action="play-again"]').addEventListener('click', onPlayAgain);
    root.querySelector('[data-action="pours"]').addEventListener('click', onPours);
  }

  /** Called by the controller like any other view; it simply ignores live games. */
  update(state) {
    if (state.status === 'playing') {
      this.renderedFor = null;
      return;
    }
    // Renders once per finished game — later updates must not restack the cards.
    if (this.renderedFor === state) return;
    this.renderedFor = state;

    const won = state.status === 'won';
    // Confetti on a win, once per finished game — the renderedFor guard above is
    // what keeps a later repaint from dropping it twice. Fire and forget, like
    // the tutorial card's entrance: ambient celebration, not a beat anything
    // waits on. Sanctioned GDD deviation, D-29.
    if (won) drop();
    this.titleEl.textContent = won ? 'Puzzle solved!' : 'Out of beans';
    this.scoreEl.textContent = won
      ? `All four sets, ${beans(state.mistakes)} used.`
      : `${state.solvedSetIds.length} of ${state.puzzle.sets.length} solved. Here they all are.`;
    this.feedbackEl.textContent = '';

    this.setsEl.innerHTML = '';
    const inTierOrder = [...state.puzzle.sets].sort((a, b) => a.difficulty - b.difficulty);
    inTierOrder.forEach((set, i) => {
      const card = this.buildCard(set, state.solvedSetIds.includes(set.id));
      this.setsEl.appendChild(card);
      settleIn(card, i * staggerStep());
    });
  }

  buildCard(set, wasSolved) {
    const [a, b, c, d] = canonicalOrder(set.pairs);
    const tier = difficultyToTier(set.difficulty);

    const card = document.createElement('div');
    card.className = 'solved-card';
    card.dataset.tier = tier;

    const badges = document.createElement('div');
    badges.className = 'badge-row';

    const tierBadge = document.createElement('span');
    tierBadge.className = 'tier-badge';
    tierBadge.textContent = tier;
    badges.appendChild(tierBadge);

    if (!wasSolved) {
      const revealed = document.createElement('span');
      revealed.className = 'revealed-badge';
      revealed.textContent = 'Revealed';
      badges.appendChild(revealed);
    }

    const analogy = document.createElement('div');
    analogy.className = 'analogy';
    analogy.textContent = `${a} : ${b} :: ${c} : ${d}`;

    const relationship = document.createElement('div');
    relationship.className = 'relationship';
    relationship.textContent = set.relationshipLabel;

    const explanation = document.createElement('p');
    explanation.className = 'explanation';
    explanation.textContent = set.explanation;

    card.append(badges, analogy, relationship, explanation);
    return card;
  }

  /** The controller reports back what sharing actually did. */
  showShareResult(result) {
    const said = {
      shared: 'Shared.',
      copied: 'Copied to your clipboard.',
      cancelled: '',
      failed: 'Could not share on this device.'
    };
    this.feedbackEl.textContent = said[result] ?? '';
  }
}

function beans(mistakes) {
  if (mistakes === 0) return 'no beans';
  return mistakes === 1 ? '1 bean' : `${mistakes} beans`;
}
