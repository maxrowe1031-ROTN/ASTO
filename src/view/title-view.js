// The title screen. READ-ONLY — emits play/tutorial intents and nothing else.
// (The one exception is a static anchor to about.html: navigation, not an intent,
// so it carries no callback.)
//
// Unlike the other views it is not state-driven, so it has no update(state): it is a
// front door, shown before any game exists. It is what makes the tutorial replayable
// once the first run is behind the player.
//
// Since D-24, Play means TODAY'S puzzle — the daily loop's front door — and
// Past Pours is the door to every day before this one. "How to play" stays a
// peer of playing rather than a footnote under a calendar.

export class TitleView {
  constructor(root, { onPlay, onPours, onTutorial }) {
    root.innerHTML = `
      <div class="title-block">
        <h1 class="title-wordmark">ASTO</h1>
        <p class="title-tagline">This is to that.</p>
        <div class="controls title-actions">
          <button class="pill" data-action="tutorial">How to play</button>
          <button class="pill" data-action="pours">Past Pours</button>
          <button class="pill primary" data-action="play">Play</button>
        </div>
        <a class="text-action" href="about.html">About this project</a>
      </div>`;

    root.querySelector('[data-action="play"]').addEventListener('click', onPlay);
    root.querySelector('[data-action="pours"]').addEventListener('click', onPours);
    root.querySelector('[data-action="tutorial"]').addEventListener('click', onTutorial);
  }
}
