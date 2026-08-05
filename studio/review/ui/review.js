// review.js — the Review Studio page.
//
// Two views behind a hash route: the run list, and one run's current attempt.
// It talks only to /api/*, holds no rules of its own, and re-renders from the
// server's answer rather than tracking state locally — a run's status is
// already a state machine on the server, and mirroring it here would only
// create a second version that can be wrong.

import { boardHtml } from './board-html.js';
import { feedbackControls, collectFeedback } from './feedback.js';

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

const reportPanel = (title, value) =>
  value === undefined
    ? ''
    : `<details class="panel report">
         <summary>${escape(title)}</summary>
         <pre>${escape(JSON.stringify(value, null, 2))}</pre>
       </details>`;

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
               },
             )}</div>
           </section>`
        : ''
    }

    ${reportPanel('Difficulty rater', attempt.reports['03-difficulty-rater'])}
    ${reportPanel('Integrity gate', attempt.reports['04a-integrity'])}
    ${reportPanel('Analogy validator', attempt.reports['05-analogy-validator'])}
    ${reportPanel('Adversarial solver', attempt.reports['06-adversarial-solver'])}
    ${reportPanel('Test player', attempt.reports['07-test-player'])}
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
                   ${['01-pair-author', '02-theme-grouper', '03-difficulty-rater', '04-board-builder']
                     .map((s) => `<option value="${s}">${s}</option>`)
                     .join('')}
                 </select>
               </label>
               <button class="pill" data-act="revise" ${decidable ? '' : 'disabled'}>Request revision</button>
             </div>
           </section>`
        : ''
    }

    <details class="panel report"><summary>Feedback so far (${detail.feedback.length})</summary>
      ${feedbackList(detail.feedback)}</details>`;

  wireDecisions(runId, attemptId);
  wirePlay(attempt.board);
  schedulePoll(working, runId);
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
    const { startPlay } = await import('./play.js');
    preview.hidden = true;
    bar.hidden = true;
    const host = document.createElement('div');
    panel.append(host);
    session = startPlay(host, board, {
      onExit: () => {
        stop();
        host.remove();
      },
    });
  });
}

function wireDecisions(runId, attemptId) {
  const panel = document.getElementById('feedback');
  if (!panel) return;

  panel.addEventListener('click', async (event) => {
    const action = event.target.dataset?.act;
    if (!action) return;
    event.preventDefault();

    const defaultAction = { approve: 'approve-set', reject: 'reject-set' }[action] ?? 'revise-set';
    const events = collectFeedback(panel, { attemptId, defaultAction });

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

// The revision prompt gets the notes Max just wrote, so the rerun is actually
// told what was wrong rather than just re-rolling.
const notesFor = (events) =>
  events
    .map((e) => `${e.scope.type === 'set' ? `${e.scope.setId}: ` : ''}${[...e.tags, e.note ?? ''].filter(Boolean).join('; ')}`)
    .join('\n')
    .slice(0, 2000);

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
