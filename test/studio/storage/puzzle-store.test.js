// puzzle-store — the only module that writes into puzzles/.
//
// The rules that matter here are the ones a published board can never be
// allowed to break, because `puzzles/` is what the shipped game loads: the
// board is checked with the GAME's own validator and integrity sweep before a
// byte is written, a refusal writes nothing at all, and a slug can never
// reach outside the directory.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createPuzzleStore, PublishRefused } from '../../../studio/storage/puzzle-store.js';

const tempDir = () => mkdtempSync(join(tmpdir(), 'asto-puzzles-'));

/** A board that passes both the schema and the integrity sweep. */
const goodBoard = () => ({
  id: 'model-authored-id-01',
  title: 'Gotham Connections',
  sets: [
    {
      id: 'set-1',
      relationshipLabel: 'a broad category and one specific example of it',
      explanation: 'Joker is a villain the way the Batmobile is a vehicle.',
      pairs: [['villain', 'Joker'], ['vehicle', 'Batmobile']],
      difficulty: 1,
    },
    {
      id: 'set-2',
      relationshipLabel: 'the hero and the tool that marks them',
      explanation: 'Batman carries a Batarang the way Catwoman carries a whip.',
      pairs: [['Batman', 'Batarang'], ['Catwoman', 'whip']],
      difficulty: 2,
    },
    {
      id: 'set-3',
      relationshipLabel: 'a substance and the effect it produces',
      explanation: 'Venom grants strength the way toxin induces fear.',
      pairs: [['Venom', 'strength'], ['toxin', 'fear']],
      difficulty: 3,
    },
    {
      id: 'set-4',
      relationshipLabel: 'the time of day and the activity that belongs to it',
      explanation: 'Night is for patrol the way dusk is for a stakeout.',
      pairs: [['night', 'patrol'], ['dusk', 'stakeout']],
      difficulty: 4,
    },
  ],
});

function withStore(run) {
  const rootDir = tempDir();
  try {
    return run(createPuzzleStore({ rootDir }), rootDir);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

test('publishing writes the board where the game loads it from', () => {
  withStore((store, rootDir) => {
    const result = store.publish({ board: goodBoard(), slug: 'batman' });

    assert.equal(result.filename, 'batman.json');
    assert.equal(result.id, 'asto-batman');
    const written = JSON.parse(readFileSync(join(rootDir, 'batman.json'), 'utf8'));
    assert.equal(written.title, 'Gotham Connections');
    assert.equal(written.sets.length, 4);
  });
});

// The id is the key Phase 5 will persist per-puzzle results under. It is
// normalized once, at publish, so it never has to be renamed later — renaming
// it would orphan saved progress.
test('the model\'s id is replaced by the convention, and the original is reported', () => {
  withStore((store) => {
    const result = store.publish({ board: goodBoard(), slug: 'batman' });
    assert.equal(result.id, 'asto-batman');
    assert.equal(result.originalId, 'model-authored-id-01');
    assert.equal(store.read('batman').id, 'asto-batman');
  });
});

test('a published board carries no provenance — it is indistinguishable from a hand-authored one', () => {
  withStore((store) => {
    store.publish({ board: goodBoard(), slug: 'batman' });
    const written = store.read('batman');
    // Schema v1.0 is locked. Anything beyond it would make the shipped game's
    // content two shapes instead of one.
    assert.deepEqual(Object.keys(written).sort(), ['id', 'sets', 'title']);
  });
});

test('a board that fails the schema is refused, and nothing is written', () => {
  withStore((store, rootDir) => {
    const board = goodBoard();
    delete board.sets[0].explanation; // required by schema v1.0

    assert.throws(
      () => store.publish({ board, slug: 'broken' }),
      (error) => error instanceof PublishRefused && error.reason === 'invalid',
    );
    assert.deepEqual(readdirSync(rootDir), [], 'a refused publish left a file behind');
  });
});

test('a legacy-schema board is refused by the game\'s own validator', () => {
  withStore((store) => {
    const board = goodBoard();
    board.sets[0].tier = 'green'; // schema v1.0 derives the tier; it has no field

    assert.throws(
      () => store.publish({ board, slug: 'legacy' }),
      (error) => error instanceof PublishRefused && error.reason === 'invalid',
    );
  });
});

// What the sweep actually guards, stated honestly.
//
// A board that reaches the sweep has already passed schema v1.0, which
// requires exactly four sets and sixteen DISTINCT words. Given that, every set
// contributes exactly its four derived orders and cross-pair readings are not
// accepted — so 16/16 is arithmetic, and no board defect can fail here. The
// sweep is not redundant for that reason: it samples the real
// `engine.submit()` over all 43,680 ordered tuples, so if the engine ever
// widened acceptance — a submission quietly sorted, say — publishing would
// stop rather than ship boards whose answers had changed underneath them.
// This is `board-integrity.test.js`'s guarantee, applied at the moment of
// publication instead of at the next `npm test`.
test('publishing runs the full 43,680-tuple sweep and reports it', () => {
  withStore((store) => {
    const result = store.publish({ board: goodBoard(), slug: 'batman' });
    assert.equal(result.integrity.tuplesChecked, 43_680);
    assert.equal(result.integrity.acceptedCount, 16);
    assert.equal(result.integrity.expectedAccepted, 16);
  });
});

test('a duplicated word is caught before the sweep, and nothing is written', () => {
  withStore((store, rootDir) => {
    const board = goodBoard();
    board.sets[1].pairs = [['villain', 'Batarang'], ['Catwoman', 'whip']]; // 'villain' is set-1's

    assert.throws(
      () => store.publish({ board, slug: 'collides' }),
      (error) => error instanceof PublishRefused && error.reason === 'invalid',
    );
    assert.deepEqual(readdirSync(rootDir), [], 'a refused publish left a file behind');
  });
});

// Traversal is impossible by construction rather than by filtering — the same
// habit the API uses for run ids.
test('a slug that could reach outside the directory is refused', () => {
  withStore((store) => {
    for (const slug of ['../escape', 'a/b', '.hidden', 'Batman', '', 'x'.repeat(65)]) {
      assert.throws(
        () => store.publish({ board: goodBoard(), slug }),
        (error) => error instanceof PublishRefused && error.reason === 'bad-slug',
        `slug ${JSON.stringify(slug)} was not refused`,
      );
    }
  });
});

test('an occupied slug is refused rather than silently overwritten', () => {
  withStore((store) => {
    store.publish({ board: goodBoard(), slug: 'batman' });
    const second = goodBoard();
    second.title = 'A Different Board';

    assert.throws(
      () => store.publish({ board: second, slug: 'batman' }),
      (error) => error instanceof PublishRefused && error.reason === 'occupied',
    );
    assert.equal(store.read('batman').title, 'Gotham Connections', 'the first board was overwritten');
  });
});

test('replace: true is how a republish overwrites its own file', () => {
  withStore((store) => {
    store.publish({ board: goodBoard(), slug: 'batman' });
    const revised = goodBoard();
    revised.title = 'Gotham Connections, revised';

    store.publish({ board: revised, slug: 'batman', replace: true });
    assert.equal(store.read('batman').title, 'Gotham Connections, revised');
  });
});

// An id collision cannot happen independently of a slug collision, because the
// id is derived from the slug. Worth pinning: it is the property that makes the
// occupied check sufficient.
test('the id is derived from the slug, so a slug collision is the only collision', () => {
  withStore((store) => {
    const first = store.publish({ board: goodBoard(), slug: 'birds' });
    const second = store.publish({ board: goodBoard(), slug: 'batman' });
    assert.notEqual(first.id, second.id);
  });
});

test('list reports what has been published, ignoring anything that is not a board', () => {
  withStore((store, rootDir) => {
    assert.deepEqual(store.list(), []);

    store.publish({ board: goodBoard(), slug: 'batman' });
    store.publish({ board: goodBoard(), slug: 'birds' });
    writeFileSync(join(rootDir, 'index.json'), '{}'); // the Phase 5 manifest, when it lands
    writeFileSync(join(rootDir, 'notes.txt'), 'not a board');

    assert.deepEqual(
      store.list().map((entry) => entry.slug),
      ['batman', 'birds'],
    );
    assert.equal(store.list()[0].id, 'asto-batman');
    assert.equal(store.has('batman'), true);
    assert.equal(store.has('nothing'), false);
  });
});

test('the directory is created on first publish rather than assumed', () => {
  const rootDir = join(tempDir(), 'not-yet');
  try {
    const store = createPuzzleStore({ rootDir });
    store.publish({ board: goodBoard(), slug: 'batman' });
    assert.ok(existsSync(join(rootDir, 'batman.json')));
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
