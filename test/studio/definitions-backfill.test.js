// The definitions backfill (D-33) — every published board gets sixteen plain
// definitions through the same seams the glossary backfill used: the same
// agent the pipeline runs, and puzzle-store.publish as the only door. No
// review file, by Max's call: everything auto-applies.
//
// Temp directories and an injected transport. Zero network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyDefinitions,
  authorDefinitions,
  listBoardsNeedingDefinitions,
} from '../../studio/definitions-backfill.js';
import { createPuzzleStore } from '../../studio/storage/puzzle-store.js';

const goodBoard = (id = 'board-01', title = 'Gotham Connections') => ({
  id,
  title,
  sets: [
    { id: 'set-1', relationshipLabel: 'a broad category and one specific example of it',
      explanation: 'Joker is a villain the way the Batmobile is a vehicle.',
      pairs: [['villain', 'Joker'], ['vehicle', 'Batmobile']], difficulty: 1 },
    { id: 'set-2', relationshipLabel: 'the hero and the tool that marks them',
      explanation: 'Batman carries a Batarang the way Catwoman carries a whip.',
      pairs: [['Batman', 'Batarang'], ['Catwoman', 'whip']], difficulty: 2 },
    { id: 'set-3', relationshipLabel: 'a substance and the effect it produces',
      explanation: 'Venom grants strength the way toxin induces fear.',
      pairs: [['Venom', 'strength'], ['toxin', 'fear']], difficulty: 3 },
    { id: 'set-4', relationshipLabel: 'the time of day and the activity that belongs to it',
      explanation: 'Night is for patrol the way dusk is for a stakeout.',
      pairs: [['night', 'patrol'], ['dusk', 'stakeout']], difficulty: 4 },
  ],
});
const WORDS = goodBoard().sets.flatMap((set) => set.pairs.flat());
const sixteen = () => WORDS.map((word) => ({ word, definition: `plainly, ${word}` }));

function world() {
  const puzzlesDir = mkdtempSync(join(tmpdir(), 'asto-defs-puzzles-'));
  const puzzles = createPuzzleStore({ rootDir: puzzlesDir });
  return { puzzles, puzzlesDir, cleanup: () => rmSync(puzzlesDir, { recursive: true, force: true }) };
}

function scriptedTransport(replies) {
  const calls = [];
  const transport = async (request) => {
    calls.push(request);
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    return { text: reply, usage: { inputTokens: 1, outputTokens: 1 }, stopReason: 'end_turn', model: request.model };
  };
  transport.calls = calls;
  return transport;
}

test('boards without a full sixteen are listed; complete ones are not', (t) => {
  const w = world();
  t.after(w.cleanup);
  w.puzzles.publish({ board: goodBoard('b1', 'Bare'), slug: 'bare' });
  w.puzzles.publish({ board: { ...goodBoard('b2', 'Partial'), definitions: sixteen().slice(0, 3) }, slug: 'partial' });
  w.puzzles.publish({ board: { ...goodBoard('b3', 'Full'), definitions: sixteen() }, slug: 'full' });

  const entries = listBoardsNeedingDefinitions({ puzzles: w.puzzles });
  assert.deepEqual(entries.map((e) => [e.slug, e.missing]).sort(), [['bare', 16], ['partial', 13]]);
});

test('a valid reply is authored on the first round', async () => {
  const transport = scriptedTransport([JSON.stringify({ definitions: sixteen() })]);
  const result = await authorDefinitions({ entry: { slug: 'x', board: goodBoard() }, transport });
  assert.equal(result.ok, true, JSON.stringify(result.failure));
  assert.equal(result.definitions.length, 16);
  assert.equal(transport.calls[0].stageId, '10-definitions-author');
});

test('an invalid reply is retried with feedback, and two failures leave a diagnosable record', async () => {
  const short = JSON.stringify({ definitions: sixteen().slice(0, 15) });
  const transport = scriptedTransport([short, short]);
  const result = await authorDefinitions({ entry: { slug: 'x', board: goodBoard() }, transport });
  assert.equal(result.ok, false);
  assert.equal(result.failure.category, 'invalid-output');
  assert.equal(result.failure.rounds.length, 2);
  assert.match(result.failure.reply, /definitions/);
  // llm.js appends validation feedback to the retry's prompt — the missing
  // word ("stakeout", the sixteenth) must be named there.
  assert.equal(transport.calls.length, 2);
  assert.match(transport.calls[1].prompt, /rejected/);
  assert.match(transport.calls[1].prompt, /stakeout/);
});

test('applyDefinitions writes through puzzle-store and changes nothing else', (t) => {
  const w = world();
  t.after(w.cleanup);
  const board = { ...goodBoard(), glossary: [{ word: 'Batarang', definition: 'a bat-shaped throwing blade' }] };
  w.puzzles.publish({ board, slug: 'gotham' });

  applyDefinitions({ puzzles: w.puzzles, slug: 'gotham', definitions: sixteen() });

  const after = w.puzzles.read('gotham');
  assert.equal(after.definitions.length, 16);
  assert.deepEqual(after.glossary, board.glossary);
  assert.equal(after.title, board.title);
});
