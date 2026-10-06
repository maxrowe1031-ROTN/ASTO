import test from 'node:test';
import assert from 'node:assert/strict';
import { wireDesk } from '../../../studio/review/ui/desk.js';

// A minimal bubbling DOM: route renders replace children but retain the view.
class Element {
  constructor(parent = null) { this.parent = parent; this.listeners = []; }
  addEventListener(type, fn) { if (type === 'click') this.listeners.push(fn); }
  click(target) {
    for (const fn of this.listeners) fn({ target });
    this.parent?.click(target);
  }
}

test('Desk Play routes once; review Play cannot reach old Desk handlers after navigation', () => {
  const root = new Element();
  const calls = [];
  const button = (runId) => ({
    dataset: runId ? { runId } : {},
    closest(selector) { return selector.includes('[data-run-id]') && !runId ? null : this; },
  });
  for (let visit = 0; visit < 2; visit++) {
    const queue = new Element(root);
    const form = new Element(root);
    root.querySelector = (selector) => selector === '#launcher-form' ? form : queue;
    wireDesk(root, { runs: [], onStart() {}, onPlay: (id) => calls.push(id) });
    queue.click(button('candidate-' + visit));
    // The queue is now detached, and the review's play button is inside root.
    root.click(button());
  }
  assert.deepEqual(calls, ['candidate-0', 'candidate-1']);
});
