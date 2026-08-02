// The title screen. READ-ONLY — emits play/tutorial intents and nothing else.
//
// Unlike the other views it is not state-driven, so it has no update(state): it is a
// front door, shown before any game exists. It is what makes the tutorial replayable
// once the first run is behind the player.
//
// Phase 5's puzzle-select screen may well absorb this; see docs/log.md.

export class TitleView {
  constructor(root, { onPlay, onTutorial }) {
    root.innerHTML = `
      <div class="title-block">
        <h1 class="title-wordmark">ASTO</h1>
        <p class="title-tagline">Connections, but with analogies.</p>
        <div class="controls title-actions">
          <button class="pill primary" data-action="play">Play</button>
          <button class="pill" data-action="tutorial">How to play</button>
        </div>
      </div>`;

    root.querySelector('[data-action="play"]').addEventListener('click', onPlay);
    root.querySelector('[data-action="tutorial"]').addEventListener('click', onTutorial);
  }
}
