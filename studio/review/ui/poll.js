// poll.js — one timer for the whole page.
//
// A screen asks to be re-rendered while something is in flight and stops
// asking when nothing is. The router owns the poller; a route change cancels
// whatever the last screen scheduled, so a slow response never repaints a
// screen the reader has left.

export const POLL_MS = 2500;

export function createPoller({ ms = POLL_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null;
  let token = 0;
  return {
    /** Re-arm: call `tick` after `ms` unless cancelled or re-armed first. */
    arm(tick) {
      this.cancel();
      const mine = token;
      timer = setTimer(() => {
        timer = null;
        if (mine === token) tick();
      }, ms);
    },
    cancel() {
      token += 1;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
    get armed() {
      return timer !== null;
    },
  };
}
