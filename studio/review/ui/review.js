// review.js — the Review Studio page.
//
// Two views behind a hash route: the run list, and one run's current attempt.
// It talks only to /api/*, holds no rules of its own, and re-renders from the
// server's answer rather than tracking state locally — a run's status is
// already a state machine on the server, and mirroring it here would only
// create a second version that can be wrong.

import { boardHtml } from './board-html.js';
import { simulatedSoClose } from './so-close.js';
import { feedbackControls, collectFeedback, FORM_VERSION } from './feedback.js';
import { STAGE_IDS_FOR_REVISION } from '../../stage-registry.js';
// The same derivation the server publishes under, not a second copy of it: the
// destination shown before the click has to be the destination.
import { slugify } from '../../slug.js';

const view = document.getElementById('view');
const POLL_MS = 2500;
let pollTimer = null;

const escape = (value) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// Inline, never alert(): a modal dialog blocks the page, and this page polls
// itself. A stuck alert would freeze the run it is trying to report on.
function notify(message, kind = 'error') {
  let bar = document.getElementById('notice');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'notice';
    document.body.append(bar);
  }
  bar.className = `notice notice-${kind}`;
  bar.textContent = message;
  bar.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    bar.hidden = true;
  }, 6000);
}

async function api(path, options) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: options?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`);
  return body;
}

// The effort profile rides alongside the cost on purpose. Across a batch of
// reviews it is what turns "these boards cost less" into "these boards cost
// less AND here is whether they were worse" — the judgements are being made
// anyway, so the profile is what makes them answer a second question.
const money = (attempt) => {
  const usage = attempt?.usage;
  if (!usage) return '—';
  const spend = `${usage.attempt.requests} req · ${usage.attempt.tokens.toLocaleString()} tok · ~$${usage.attempt.costUsd.toFixed(4)}`;
  return attempt.effortProfile ? `${spend} · effort ${attempt.effortProfile}` : spend;
};

// --- run list ---

// The settings the SERVER is holding, shown beside the button that spends
// money under them. A server left running keeps the config it started with, so
// this line is how a stale one becomes visible: if it disagrees with
// pipeline-config.js in the repo, the fix has not reached this process yet.
// Same vocabulary as `money()` above, so "effort <profile>" reads the same
// whether it is describing a past attempt or the next one.
const serverLine = (config) =>
  config
    ? `<p class="studio-muted">server: effort ${escape(config.effortProfile ?? 'none')} · pricing ${escape(config.pricingVersion ?? 'none')}</p>`
    : '';

async function renderList() {
  // A failure here must not blank the run list — the settings line is context,
  // the runs are the page.
  const [{ runs }, config] = await Promise.all([api('/runs'), api('/config').catch(() => null)]);
  view.innerHTML = `
    <section class="panel">
      <h2>New run</h2>
      <form id="new-run" class="new-run">
        <label>Theme <input name="theme" placeholder="leave blank for surprise-me" /></label>
        <label>Pairs <input name="count" type="number" value="14" min="12" max="16" /></label>
        <label class="inline"><input name="mock" type="checkbox" /> mock (no API spend)</label>
        <button class="pill primary" type="submit">Generate a board</button>
      </form>
      ${serverLine(config)}
    </section>

    <section class="panel">
      <h2>Runs <span class="studio-muted">(${runs.length})</span></h2>
      ${runs.length === 0 ? '<p class="studio-muted">Nothing yet.</p>' : ''}
      <ul class="run-list">
        ${runs
          .map(
            (run) => `
          <li>
            <a href="#/runs/${encodeURIComponent(run.runId)}">
              <strong>${escape(run.theme ?? 'surprise-me')}</strong>
              <span class="status status-${escape(run.status)}">${escape(run.status)}</span>
              <span class="studio-muted">${escape(run.runId)}</span>
              <span class="studio-muted">${run.attemptCount} attempt(s)</span>
            </a>
          </li>`,
          )
          .join('')}
      </ul>
    </section>`;

  document.getElementById('new-run').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const theme = String(form.get('theme') ?? '').trim();
    try {
      const { runId } = await api('/runs', {
        method: 'POST',
        body: JSON.stringify({
          theme: theme.length > 0 ? theme : null,
          count: Number(form.get('count')),
          mock: form.get('mock') === 'on',
        }),
      });
      location.hash = `#/runs/${encodeURIComponent(runId)}`;
    } catch (error) {
      notify(error.message);
    }
  });
}

// --- one run ---

const TIER_NAMES = { 1: 'green', 2: 'yellow', 3: 'red', 4: 'black' };
const tierName = (difficulty) => TIER_NAMES[difficulty] ?? `difficulty ${difficulty}`;

/**
 * Past feedback, read back as sentences rather than as the raw JSON this used
 * to dump. A change-difficulty event in particular is unreadable as an object
 * — `before: {difficulty: 2}, after: {difficulty: 3}` is the corpus's spelling
 * of "plays like red, was yellow", and the point of showing it is that Max can
 * see at a glance where he has been disagreeing with the rater.
 */
function feedbackList(events) {
  if (!events || events.length === 0) return '<p class="studio-muted">Nothing recorded yet.</p>';
  return `<ul class="fb-log">${events
    .map((event) => {
      const where = event.scope?.type === 'set' ? escape(event.scope.setId) : 'the board';
      const body =
        event.action === 'change-difficulty'
          ? `plays like <strong>${escape(tierName(event.after?.difficulty))}</strong> — was ${escape(
              tierName(event.before?.difficulty),
            )}`
          : `<strong>${escape(event.action)}</strong>${
              (event.tags ?? []).length > 0 ? ` · ${escape(event.tags.join(', '))}` : ''
            }`;
      const note = event.note ? `<div class="fb-log-note">${escape(event.note)}</div>` : '';
      return `<li><span class="studio-muted">${where}</span> ${body}${note}</li>`;
    })
    .join('')}</ul>`;
}

const reportPanel = (title, value, lede = '') =>
  value === undefined
    ? ''
    : `<details class="panel report">
         <summary>${escape(title)}</summary>
         ${lede}
         <pre>${escape(JSON.stringify(value, null, 2))}</pre>
       </details>`;

/**
 * The test player's own so-close rate, in words, above its raw report.
 *
 * A model does not experience a coin flip — it picks an order and explains it —
 * so this number is expected to be LOW on a board that coin-flips a human. It
 * is here to be compared with Max's real count, not trusted in its place.
 */
function soCloseLine(attempt) {
  if (!attempt.board) return '';
  const { soClose, submissions } = simulatedSoClose(attempt.board, attempt.reports['07-test-player']);
  if (submissions === 0) return '';
  return `<p class="studio-muted">Simulated: ${soClose} of ${submissions} submission(s) were right-words-wrong-order.</p>`;
}

/**
 * The evaluators' findings, regrouped from stage-shaped to set-shaped.
 *
 * 05 and 06 have been describing real defects for weeks, filed by stage in a
 * collapsed panel at the foot of the page — so Max rediscovered them by
 * playing the boards instead. Their findings were per-set all along; this is
 * only a regrouping, and `board-html.js` stays ignorant of which stage said
 * what.
 *
 * A cross-reading answered `valid: true` is the loudest thing on the page,
 * because it is the one defect that makes a board actively unfair: the engine
 * refuses that reading, so a player who finds it is marked wrong for being
 * right. Answered `false` is silent — a checklist item that passed is not news.
 */
function machineNotesBySet(attempt) {
  const notes = {};
  const add = (setId, note) => {
    if (!setId) return;
    (notes[setId] ??= []).push(note);
  };

  for (const verdict of attempt.reports['05-analogy-validator']?.verdicts ?? []) {
    // Only the failures. A pass note says the set works, which is what the set
    // already looks like — it would be noise on every card.
    if (verdict.pass === false) {
      add(verdict.setId, { source: 'analogy validator', level: 'medium', text: verdict.notes });
    }
  }

  const solver = attempt.reports['06-adversarial-solver'];
  const setIdsByWord = new Map();
  for (const set of attempt.board?.sets ?? []) {
    for (const word of (set.pairs ?? []).flat()) setIdsByWord.set(word, set.id);
  }
  for (const finding of solver?.findings ?? []) {
    // A finding names words, not a set. It belongs to a set when all its words
    // come from one; anything spanning sets is a board-level observation and
    // stays in the panel below rather than being filed under a set arbitrarily.
    const owners = new Set((finding.words ?? []).map((word) => setIdsByWord.get(word)));
    if (owners.size === 1) {
      const [setId] = [...owners];
      add(setId, { source: finding.kind, level: finding.severity, text: finding.note });
    }
  }
  // 07 is blind by construction — it names words, never sets — so the mapping
  // from word to set happens here, exactly as it does for 06's findings above.
  // This is the detector for a set only its subject's fans can solve, which is
  // the defect Max found by playing (design.md D-8).
  for (const gated of attempt.reports['07-test-player']?.knowledgeGated ?? []) {
    add(setIdsByWord.get(gated.word), {
      source: 'needs knowledge',
      level: 'medium',
      text: `"${gated.word}" — ${gated.note}`,
    });
  }

  for (const reading of solver?.crossReadings ?? []) {
    if (!reading.valid) continue;
    const [a, b, c, d] = reading.reading;
    add(reading.setId, {
      source: 'also reads',
      level: 'high',
      text: `${a} : ${b} :: ${c} : ${d} — ${reading.note} The engine refuses this reading, so a player who finds it loses a mistake.`,
    });
  }

  // Order fairness (design.md D-9). Three sources, deliberately combined here
  // rather than shown as three panels: 04a says which sets are structurally
  // symmetric, 06 says whether the words rescue the order, 07 says whether it
  // felt like a guess. Only the unrescued ones are news — a set 06 cleared is
  // silent for the same reason a cross-reading answered `false` is.
  const cleared = new Set(
    (solver?.orderReadings ?? []).filter((entry) => entry.inferable).map((entry) => entry.setId),
  );
  for (const flag of attempt.reports['04a-integrity']?.orderFairness?.flagged ?? []) {
    if (cleared.has(flag.setId)) continue;
    const verdict = (solver?.orderReadings ?? []).find((entry) => entry.setId === flag.setId);
    add(flag.setId, {
      source: 'order may be a coin flip',
      level: 'high',
      text:
        `${flag.note ?? `this set's relationship reads the same both ways round`}. ` +
        `The engine accepts a flip only when BOTH pairs flip together, so a player who reads one pair the other way round loses a mistake on a grouping they had right` +
        (verdict ? '. The adversarial solver agrees a player would be guessing' : ''),
    });
  }
  // 07 names words, never sets — mapped here like everything else it reports.
  for (const guessed of attempt.reports['07-test-player']?.orderGuessed ?? []) {
    const owners = new Set((guessed.words ?? []).map((word) => setIdsByWord.get(word)));
    if (owners.size !== 1) continue;
    const [setId] = [...owners];
    add(setId, { source: 'test player guessed the order', level: 'medium', text: guessed.note });
  }

  return notes;
}


async function renderRun(runId) {
  const detail = await api(`/runs/${encodeURIComponent(runId)}`);
  const { manifest } = detail;
  const attemptId = manifest.currentAttemptId;
  const working = manifest.status === 'running' || manifest.status === 'revising';

  if (!attemptId) {
    view.innerHTML = `<section class="panel"><h2>${escape(runId)}</h2>
      <p>Status: <span class="status status-${escape(manifest.status)}">${escape(manifest.status)}</span></p>
      <p class="studio-muted">Waiting for the first attempt…</p></section>`;
    schedulePoll(working, runId);
    return;
  }

  const attempt = await api(`/runs/${encodeURIComponent(runId)}/attempts/${attemptId}`);
  const decidable = manifest.status === 'awaiting-review';

  view.innerHTML = `
    <section class="panel">
      <h2>${escape(manifest.theme ?? 'surprise-me')}</h2>
      <p class="studio-muted">${escape(runId)} · attempt ${escape(attemptId)}${
        attempt.attempt.parentAttemptId ? ` · revision of ${escape(attempt.attempt.parentAttemptId)}` : ''
      }</p>
      <p>
        <span class="status status-${escape(manifest.status)}">${escape(manifest.status)}</span>
        <span class="studio-muted">${escape(money(attempt.attempt))}</span>
      </p>
      ${working ? '<p class="studio-muted">Working… this page refreshes itself.</p>' : ''}
      ${
        attempt.revision
          ? `<p class="studio-muted">Revision asked for: ${escape(attempt.revision.notes)}</p>`
          : ''
      }
      ${
        attempt.failure
          ? `<p class="failure">[${escape(attempt.failure.category)}] ${escape(attempt.failure.message)}</p>`
          : ''
      }
    </section>

    ${publishPanel(runId, manifest, detail.decisions, attempt.board)}

    ${
      attempt.board
        ? `<section class="panel board-panel" id="board-panel">
             <div class="play-bar">
               <button class="pill" data-act="play">Play this board</button>
               <span class="studio-muted">judge it by playing it</span>
             </div>
             <div id="board-preview">${boardHtml(
               attempt.board,
               attempt.reports['04-board-builder']?.promotions ?? [],
               {
                 // Set id → declared shape, from the grouper — the card
                 // teaches each set's stance beside its paradigm pair.
                 shapesBySet: Object.fromEntries(
                   (attempt.reports['02-theme-grouper']?.sets ?? []).map((set) => [set.id, set.shape]),
                 ),
                 unity: attempt.reports['08-style-guide']?.unity ?? null,
                 evocativeness: attempt.reports['08-style-guide']?.evocativeness ?? null,
                 notesBySet: machineNotesBySet(attempt),
               },
             )}</div>
           </section>`
        : ''
    }

    <section class="panel" id="proposal-panel" hidden></section>

    ${reportPanel('Difficulty rater', attempt.reports['03-difficulty-rater'])}
    ${reportPanel('Integrity gate', attempt.reports['04a-integrity'])}
    ${reportPanel('Analogy validator', attempt.reports['05-analogy-validator'])}
    ${reportPanel('Adversarial solver', attempt.reports['06-adversarial-solver'])}
    ${reportPanel('Test player', attempt.reports['07-test-player'], soCloseLine(attempt))}
    ${reportPanel('Style guide', attempt.reports['08-style-guide'])}

    ${
      attempt.board
        ? `<section class="panel" id="feedback">
             <h2>Your read</h2>
             ${feedbackControls(attempt.board)}
             <div class="decisions">
               <button class="pill" data-act="save" ${decidable ? '' : 'disabled'}>Save feedback</button>
               <button class="pill primary" data-act="approve" ${decidable ? '' : 'disabled'}>Approve</button>
               <button class="pill" data-act="reject" ${decidable ? '' : 'disabled'}>Reject</button>
             </div>
             <div class="revise">
               <label>Revise from
                 <select id="from-stage">
                   ${STAGE_IDS_FOR_REVISION.map((s) => `<option value="${s}">${s}</option>`).join('')}
                 </select>
               </label>
               <button class="pill" data-act="revise" ${decidable ? '' : 'disabled'}>Request revision</button>
             </div>
           </section>`
        : ''
    }

    <details class="panel report"><summary>Feedback so far (${detail.feedback.length})</summary>
      ${feedbackList(detail.feedback)}</details>`;

  resetPlaythroughFor(runId, attemptId);
  wirePublish(runId);
  wireDecisions(runId, attemptId);
  wirePlay(attempt.board);
  showProposal(runId, attemptId);
  schedulePoll(working, runId);
}

/**
 * Publishing an approved board into `puzzles/` — the last step of the loop.
 *
 * Only appears once a run is approved, because that is the only status the
 * server will publish from. It is a separate panel from the feedback controls
 * on purpose: those record a judgement, this ships content, and the two should
 * never be one absent-minded click apart.
 *
 * The published state is read from the run's own decisions rather than
 * remembered here — same rule as the rest of this page.
 */
function publishPanel(runId, manifest, decisions, board) {
  if (manifest.status !== 'approved') return '';

  const published = (decisions ?? []).filter((event) => event.type === 'publish').at(-1);
  const slug =
    published?.publishedAs?.replace(/\.json$/, '') ?? slugify(board?.title) ?? slugOfRun(runId);

  return `
    <section class="panel" id="publish">
      <h2>Publish</h2>
      ${
        published
          ? `<p>Published as <code>puzzles/${escape(published.publishedAs)}</code>
               as <code>${escape(published.publishedId)}</code>.</p>
             <p class="studio-muted">
               Play it at
               <a href="http://localhost:8080/?puzzle=${encodeURIComponent(slug)}" target="_blank" rel="noreferrer"
                 >localhost:8080/?puzzle=${escape(slug)}</a>
               (needs <code>npm run serve</code>).
             </p>`
          : `<p class="studio-muted">This board is approved but has not reached the game yet.
               It would land at <code>puzzles/${escape(slug)}.json</code> as
               <code>asto-${escape(slug)}</code>.</p>`
      }
      <div class="decisions">
        <button class="pill ${published ? '' : 'primary'}" data-act="publish">
          ${published ? 'Republish' : 'Publish to puzzles/'}
        </button>
      </div>
    </section>`;
}

// The server's last-resort fallback, mirrored so the preview matches it.
const slugOfRun = (runId) => runId.slice(runId.indexOf('Z-') + 2);

function wirePublish(runId) {
  const panel = document.getElementById('publish');
  if (!panel) return;

  panel.addEventListener('click', async (event) => {
    if (event.target.dataset?.act !== 'publish') return;
    event.preventDefault();
    event.target.disabled = true;
    try {
      const { published } = await api(`/runs/${encodeURIComponent(runId)}/publish`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      notify(
        `Published as puzzles/${published.filename} — integrity ${published.integrity.acceptedCount}/${published.integrity.expectedAccepted}.`,
        'info',
      );
      route();
    } catch (error) {
      event.target.disabled = false;
      notify(error.message);
    }
  });
}

/**
 * Play ⇄ preview, swapped inside the board panel.
 *
 * Safe against the poll loop by construction rather than by a guard: polling
 * only runs while a run is `running` or `revising`, and a board that can be
 * played is past both. Navigating away replaces the whole view, which takes
 * the game with it.
 */
function wirePlay(board) {
  const panel = document.getElementById('board-panel');
  if (!panel || !board) return;

  const preview = document.getElementById('board-preview');
  const bar = panel.querySelector('.play-bar');
  let session = null;

  const stop = () => {
    session?.destroy();
    session = null;
    bar.hidden = false;
    preview.hidden = false;
  };

  panel.addEventListener('click', async (event) => {
    if (event.target.dataset?.act !== 'play') return;
    // Loaded on demand: a reviewer who never presses Play never fetches the
    // game's views or controller.
    const { startPlay, createRecorder } = await import('./play.js');
    preview.hidden = true;
    bar.hidden = true;
    const host = document.createElement('div');
    panel.append(host);

    // First completed playthrough only. A replay — showing someone, going back
    // to re-check a set — is not a first read, and difficulty data contaminated
    // by replays is worse than none. Later plays run normally; they just are
    // not recorded, and the saved record says so.
    const recorder = playthrough.record === null ? createRecorder() : null;

    session = startPlay(host, board, {
      recorder,
      onExit: () => {
        const result = recorder?.result() ?? null;
        if (result && playthrough.record === null) {
          playthrough.record = { ...result, play: 1 };
        } else if (!result && recorder) {
          // Played but not finished: nothing to calibrate against.
          playthrough.plays += 1;
        }
        stop();
        host.remove();
      },
    });
    playthrough.plays += 1;
  });
}

// Play state for ONE attempt: `record` is the first COMPLETED playthrough,
// `plays` counts every time Play was pressed so the saved event can say a
// replay happened rather than hiding it.
//
// Keyed by run and attempt, and reset when either changes. Module-level state
// that outlived its attempt would attach one board's playthrough to another —
// the same contamination the first-play-only rule exists to prevent, arriving
// by a different door.
let playthrough = { key: null, record: null, plays: 0 };

function resetPlaythroughFor(runId, attemptId) {
  const key = `${runId}/${attemptId}`;
  if (playthrough.key !== key) playthrough = { key, record: null, plays: 0 };
}

function wireDecisions(runId, attemptId) {
  const panel = document.getElementById('feedback');
  if (!panel) return;

  panel.addEventListener('click', async (event) => {
    let action = event.target.dataset?.act;
    if (!action) return;
    event.preventDefault();

    // "Publishable after a fix" is not a terminal decision. `rejected` leads
    // only to `archived`, so deciding here would strand the board in a status
    // no revision can be requested from — which is exactly what the fix is
    // for. It saves instead, leaving the run in `awaiting-review`, and the
    // Revision Proposer picks it up from the save.
    const boardVerdict = panel.querySelector('input[data-role=board-verdict]:checked')?.value;
    if (boardVerdict === 'revise-board' && (action === 'reject' || action === 'approve')) {
      action = 'save';
    }

    // The button is only the fallback now: if Max picked a board verdict in the
    // form, that wins. His rule — a board verdict is about the publishability
    // of the whole — and the set verdicts are chosen per set, never inherited.
    const defaultAction = { approve: 'approve-set', reject: 'reject-set' }[action] ?? 'revise-set';
    const events = collectFeedback(panel, {
      attemptId,
      defaultAction,
      playthrough: playthrough.record
        ? { ...playthrough.record, replayed: playthrough.plays > 1 }
        : null,
    });

    try {
      if (action === 'save') {
        if (events.length === 0) return notify('Nothing to save yet.', 'info');
        await api(`/runs/${encodeURIComponent(runId)}/feedback`, {
          method: 'POST',
          body: JSON.stringify({ events }),
        });
      } else if (action === 'revise') {
        if (events.length > 0) {
          await api(`/runs/${encodeURIComponent(runId)}/feedback`, {
            method: 'POST',
            body: JSON.stringify({ events }),
          });
        }

        // Defer to the brief when there is one — or when one is on its way.
        //
        // On 2026-08-05 the Revision Proposer wrote its first brief and it was
        // right: it named the cross-pairing as the only blocker, chose
        // 01-pair-author, offered three candidate fixes, and listed the three
        // praised sets as untouchable. It was never sent, because this button
        // sat next to it and answered first. The revision that went instead
        // carried raw tag-and-note text with no protection list, churned the
        // three good sets, and came back with the identical broken one.
        //
        // The brief is not sent silently in its place: Max still accepts, edits
        // or discards it in the panel below, which is the only way a
        // `proposal-verdict` means anything. This just stops the raw path from
        // winning a race it should not have been in.
        const pending = await proposalPending(runId);
        if (pending) {
          notify(
            pending === 'working'
              ? 'Writing a revision brief — it will appear below in a moment.'
              : 'A revision brief is ready below — send, edit or discard it there.',
            'info',
          );
          route();
          return;
        }

        await api(`/runs/${encodeURIComponent(runId)}/revisions`, {
          method: 'POST',
          body: JSON.stringify({
            fromStage: document.getElementById('from-stage').value,
            notes: notesFor(events),
          }),
        });
      } else {
        await api(`/runs/${encodeURIComponent(runId)}/${action}`, {
          method: 'POST',
          body: JSON.stringify({ feedback: events }),
        });
      }
      notify('Saved.', 'info');
      route();
    } catch (error) {
      notify(error.message);
    }
  });
}

/**
 * Is a revision brief ready, or still being written?
 *
 * `'ready'`, `'working'`, or null. A run whose proposal endpoint errors — an
 * older run, a server mid-restart — answers null, so the raw path still works
 * and the button never becomes unclickable because of an advisory nicety.
 *
 * A recorded `failure` deliberately answers null too, and that is the whole
 * reason this function ignores the field: a brief that is never coming must
 * not deadlock the button that exists for exactly that case.
 */
async function proposalPending(runId) {
  try {
    const { proposal, working } = await api(`/runs/${encodeURIComponent(runId)}/proposal`);
    if (proposal) return 'ready';
    return working ? 'working' : null;
  } catch {
    return null;
  }
}

// The revision prompt gets the notes Max just wrote, so the rerun is actually
// told what was wrong rather than just re-rolling.
const notesFor = (events) =>
  events
    .map((e) => `${e.scope.type === 'set' ? `${e.scope.setId}: ` : ''}${[...e.tags, e.note ?? ''].filter(Boolean).join('; ')}`)
    .join('\n')
    .slice(0, 2000);

/**
 * The Revision Proposer's brief, once there is one.
 *
 * It renders below the board rather than above it, and only after a rejection,
 * because an unbiased first read is the thing the review loop exists to
 * capture — putting the machine's framing in front of Max before he plays
 * would spend the very signal this is trying to make cheaper.
 *
 * The brief is editable in place. That is deliberate: what he changes is
 * precisely what the proposer got wrong, and `proposal-verdict` records the
 * edit as the evidence the auto-revise graduation trigger needs.
 */
async function showProposal(runId, attemptId) {
  const panel = document.getElementById('proposal-panel');
  if (!panel) return;

  let proposal = null;
  let working = false;
  let failure = null;
  try {
    ({ proposal, working, failure = null } = await api(`/runs/${encodeURIComponent(runId)}/proposal`));
  } catch {
    return; // an older run with no proposal endpoint answer is simply silent
  }

  if (working) {
    panel.hidden = false;
    panel.innerHTML = '<h2>Suggested fix</h2><p class="studio-muted">Working on a revision brief…</p>';
    schedulePoll(true, runId);
    return;
  }

  // Tried and could not. Said out loud, because the alternative is an empty
  // page that looks identical to a proposer that was never asked — which is
  // how the 2026-08-06 Harry Potter brief became unknowable. No buttons: there
  // is nothing to accept or discard, and Request revision below still works.
  if (!proposal && failure) {
    panel.hidden = false;
    panel.innerHTML = `
      <h2>Suggested fix</h2>
      <p class="studio-muted">The proposer ran and could not produce a usable brief.</p>
      <p class="studio-muted">${escape(failure.message ?? 'no reason recorded')}${
        failure.category ? ` (${escape(failure.category)})` : ''
      }</p>
      <p class="studio-muted">Request a revision below with your own notes — the full record is in the run directory.</p>`;
    return;
  }
  if (!proposal) return;

  const fixes = proposal.fixes
    .map(
      (fix) => `
        <li>
          <strong>${escape(fix.setId)}</strong>
          <span class="proposal-source" data-source="${escape(fix.source)}">${escape(fix.source)}</span>
          <div>${escape(fix.problem)}</div>
          <ul class="proposal-candidates">
            ${fix.candidates.map((c) => `<li>${escape(c)}</li>`).join('')}
          </ul>
        </li>`,
    )
    .join('');

  panel.hidden = false;
  panel.innerHTML = `
    <h2>Suggested fix</h2>
    <p>${escape(proposal.summary)}</p>
    <ul class="proposal-fixes">${fixes}</ul>
    ${
      proposal.doNotChange?.length
        ? `<p class="studio-muted">Leave alone: ${proposal.doNotChange.map(escape).join(' · ')}</p>`
        : ''
    }
    <label class="proposal-brief">Revision brief — edit before sending if it has it wrong
      <textarea id="proposal-notes" rows="4">${escape(briefText(proposal))}</textarea>
    </label>
    <div class="decisions">
      <button class="pill primary" data-act="propose-revise">Request revision with this brief</button>
      <button class="pill" data-act="propose-discard">Discard</button>
      <span class="studio-muted">re-enters at ${escape(proposal.fromStage)}</span>
    </div>`;

  const original = briefText(proposal);
  panel.addEventListener('click', async (event) => {
    const act = event.target.dataset?.act;
    if (act !== 'propose-revise' && act !== 'propose-discard') return;
    event.preventDefault();

    const notes = document.getElementById('proposal-notes').value.trim();
    // Three outcomes, and the middle one is the valuable one: an edited brief
    // is a labelled example of where the proposer was wrong.
    const verdict = act === 'propose-discard' ? 'discarded' : notes === original ? 'accepted' : 'edited';

    try {
      await api(`/runs/${encodeURIComponent(runId)}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          events: [
            {
              schemaVersion: '1.0',
              id: `fb-${attemptId}-proposal-${Date.now()}`,
              attemptId,
              formVersion: FORM_VERSION,
              action: 'proposal-verdict',
              scope: { type: 'board' },
              tags: [],
              proposal: { verdict, ...(verdict === 'edited' ? { edited: notes } : {}) },
              source: 'review-studio',
            },
          ],
        }),
      });

      if (act === 'propose-revise') {
        await api(`/runs/${encodeURIComponent(runId)}/revisions`, {
          method: 'POST',
          body: JSON.stringify({ fromStage: proposal.fromStage, notes }),
        });
        notify('Revision requested.', 'ok');
      } else {
        panel.hidden = true;
        notify('Brief discarded — recorded.', 'info');
      }
      route();
    } catch (error) {
      notify(error.message, 'error');
    }
  });
}

/** The proposal as the plain text a revision actually travels as. */
function briefText(proposal) {
  return [
    proposal.summary,
    ...proposal.fixes.map(
      (fix) => `- ${fix.setId}: ${fix.problem}\n  Try: ${fix.candidates.join('\n  Or: ')}`,
    ),
    proposal.doNotChange?.length
      ? `Do not change: ${proposal.doNotChange.join(', ')} — these were approved.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function schedulePoll(working, runId) {
  clearTimeout(pollTimer);
  if (!working) return;
  pollTimer = setTimeout(() => {
    if (location.hash.includes(runId)) route();
  }, POLL_MS);
}

// --- routing ---

async function route() {
  clearTimeout(pollTimer);
  const match = /^#\/runs\/(.+)$/.exec(location.hash);
  try {
    if (match) await renderRun(decodeURIComponent(match[1]));
    else await renderList();
  } catch (error) {
    view.innerHTML = `<section class="panel"><p class="failure">${escape(error.message)}</p>
      <p><a class="text-action" href="#/">Back to all runs</a></p></section>`;
  }
}

window.addEventListener('hashchange', route);
route();
