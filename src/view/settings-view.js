// The settings screen. READ-ONLY — it paints what it is given and emits
// intents; it computes nothing and stores nothing. Sound state lives in
// sound.js and persists through storage.js; this screen is just the controls.
//
// Built now at Max's call (2026-08-25, design.md D-27) rather than waiting for
// a second setting to exist. One section today: Sound — mute, and a volume
// slider that previews as it moves so a level is chosen by ear, not by number.
//
// Back returns to the TITLE screen — settings are app-wide, so their door is
// the front door, unlike statistics, which summarise the calendar and sit
// behind it. The wordmark still goes home, as it does on every screen.

export class SettingsView {
  constructor(root, { onHome, onBack, onMute, onVolume }) {
    root.innerHTML = `
      <div class="select-head">
        <h1>
          <button class="wordmark" data-action="home"
                  aria-label="ASTO — back to the title screen">ASTO</button>
        </h1>
      </div>
      <h2 class="settings-title">Settings</h2>
      <section class="settings-group" aria-labelledby="settings-sound-heading">
        <h3 id="settings-sound-heading" class="settings-group-title">Sound</h3>
        <div class="settings-row">
          <span class="settings-label" id="settings-mute-label">Sounds</span>
          <button class="pill settings-mute" data-action="mute"
                  aria-labelledby="settings-mute-label" aria-pressed="false"></button>
        </div>
        <div class="settings-row">
          <label class="settings-label" for="settings-volume">Volume</label>
          <input class="settings-volume" id="settings-volume" type="range"
                 min="0" max="100" step="1">
          <span class="settings-volume-value" aria-hidden="true"></span>
        </div>
      </section>
      <button class="text-action" data-action="back">Back</button>`;

    this.muteButton = root.querySelector('[data-action="mute"]');
    this.volumeSlider = root.querySelector('#settings-volume');
    this.volumeValue = root.querySelector('.settings-volume-value');

    root.querySelector('[data-action="home"]').addEventListener('click', onHome);
    root.querySelector('[data-action="back"]').addEventListener('click', onBack);
    this.muteButton.addEventListener('click', onMute);
    this.volumeSlider.addEventListener('input', () => onVolume(Number(this.volumeSlider.value)));
  }

  /**
   * Paint the current sound state. app.js calls this on every showing and after
   * every intent, because none of this lives in game state.
   *
   * The button says what pressing it DOES, not what the state is — "Mute" while
   * sound is on — with aria-pressed carrying the on/off for assistive tech.
   */
  render({ muted, volume }) {
    this.muteButton.textContent = muted ? 'Unmute' : 'Mute';
    this.muteButton.setAttribute('aria-pressed', String(muted));
    this.volumeSlider.value = String(volume);
    this.volumeSlider.disabled = muted;
    this.volumeValue.textContent = String(volume);
  }
}
