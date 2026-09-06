// The settings screen. READ-ONLY — it paints what it is given and emits
// intents; it computes nothing and stores nothing. Sound state lives in
// sound.js and persists through storage.js; this screen is just the controls.
//
// Built at Max's call (2026-08-25, design.md D-27) before a second setting
// existed. Two sections now: Sound — a Sounds switch, and a volume slider that
// previews as it moves so a level is chosen by ear, not by number — and Help,
// holding Learning Mode (D-33), the second setting D-27 was waiting for. Both
// on/off settings are real switches (role="switch", knob, track, On / Off
// word) since 2026-09-05, when the "Mute" / "Turn on" pills proved hard to
// read as states.
//
// The door is a gear icon beside the statistics icon in the calendar's header
// (Max's call, 2026-08-25 — the front door stays two buttons), so Back returns
// to the CALENDAR: back means the door you came through, the same rule the
// statistics screen follows. The wordmark still goes home, as everywhere.

export class SettingsView {
  constructor(root, { onHome, onBack, onMute, onVolume, onLearning }) {
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
          <button class="switch" data-action="mute" role="switch" aria-checked="true"
                  aria-labelledby="settings-mute-label"><span class="switch-knob"></span></button>
          <span class="switch-state" aria-hidden="true"></span>
        </div>
        <div class="settings-row">
          <label class="settings-label" for="settings-volume">Volume</label>
          <input class="settings-volume" id="settings-volume" type="range"
                 min="0" max="100" step="1">
          <span class="settings-volume-value" aria-hidden="true"></span>
        </div>
      </section>
      <section class="settings-group" aria-labelledby="settings-help-heading">
        <h3 id="settings-help-heading" class="settings-group-title">Help</h3>
        <div class="settings-row">
          <span class="settings-label" id="settings-learning-label">Learning mode</span>
          <button class="switch" data-action="learning" role="switch" aria-checked="false"
                  aria-labelledby="settings-learning-label"><span class="switch-knob"></span></button>
          <span class="switch-state" aria-hidden="true"></span>
        </div>
        <p class="settings-note">Vocab defines any tile you tap.</p>
      </section>
      <button class="text-action" data-action="back">Back</button>`;

    this.muteButton = root.querySelector('[data-action="mute"]');
    this.volumeSlider = root.querySelector('#settings-volume');
    this.volumeValue = root.querySelector('.settings-volume-value');
    this.learningButton = root.querySelector('[data-action="learning"]');

    root.querySelector('[data-action="home"]').addEventListener('click', onHome);
    root.querySelector('[data-action="back"]').addEventListener('click', onBack);
    this.muteButton.addEventListener('click', onMute);
    this.volumeSlider.addEventListener('input', () => onVolume(Number(this.volumeSlider.value)));
    this.learningButton.addEventListener('click', onLearning);
  }

  /**
   * Paint the current sound state. app.js calls this on every showing and after
   * every intent, because none of this lives in game state.
   *
   * The button says what pressing it DOES, not what the state is — "Mute" while
   * sound is on — with aria-pressed carrying the on/off for assistive tech.
   */
  render({ muted, volume, learningMode }) {
    // Switches say the STATE, never the action (Max, 2026-09-05: the "Mute" /
    // "Turn on" pills read as buttons and hid which way they were set). The
    // Sounds switch is on when sound plays, so it never inverts its label.
    paintSwitch(this.muteButton, !muted);
    paintSwitch(this.learningButton, learningMode);
    this.volumeSlider.value = String(volume);
    this.volumeSlider.disabled = muted;
    this.volumeValue.textContent = String(volume);
  }
}

/** Knob position, track fill and the On / Off word — the state, three ways. */
function paintSwitch(button, on) {
  button.setAttribute('aria-checked', String(on));
  button.classList.toggle('is-on', on);
  const state = button.nextElementSibling;
  if (state?.classList.contains('switch-state')) state.textContent = on ? 'On' : 'Off';
}
