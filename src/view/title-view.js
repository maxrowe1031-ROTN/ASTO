// The title screen. READ-ONLY — emits play/tutorial/settings intents and
// nothing else. (The one exception is a static anchor to about.html:
// navigation, not an intent, so it carries no callback.)
//
// Unlike the other views it is not state-driven, so it has no update(state): it is a
// front door, shown before any game exists. It is what makes the tutorial replayable
// once the first run is behind the player.
//
// Since D-24 (revised at Max's review, 2026-08-18), Play opens the CALENDAR
// with today highlighted — one door into all the puzzles, today first among
// them. Two buttons on purpose: the simpler front door was his call.

export class TitleView {
  constructor(root, { onPlay, onTutorial, onSettings }) {
    root.innerHTML = `
      <div class="title-block">
        <h1 class="title-wordmark">ASTO</h1>
        <p class="title-tagline">This is to that.</p>
        <div class="controls title-actions">
          <button class="pill" data-action="tutorial">How to play</button>
          <button class="pill primary" data-action="play">Play</button>
        </div>
        <button class="text-action" data-action="settings">Settings</button>
        <a class="text-action" href="about.html">About this project</a>
      </div>`;

    root.querySelector('[data-action="play"]').addEventListener('click', onPlay);
    root.querySelector('[data-action="tutorial"]').addEventListener('click', onTutorial);
    root.querySelector('[data-action="settings"]').addEventListener('click', onSettings);
  }
}
