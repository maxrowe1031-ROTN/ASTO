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

const TODAY = '2026-08-18';

function withStore(run) {
  const rootDir = tempDir();
  try {
    return run(createPuzzleStore({ rootDir, today: () => TODAY }), rootDir);
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

// The id, and the slug it derives from, are how a board is identified for the
// life of the project — the manifest lists both and saved results are keyed by
// slug. Normalized once, at publish, so it never has to be renamed later;
// renaming it would orphan a player's saved progress.
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
    // content two shapes instead of one. `date` is IN the schema (optional
    // since v1.0, the scheduling field since D-24) — it is when, not where-from.
    assert.deepEqual(Object.keys(written).sort(), ['date', 'id', 'sets', 'title']);
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
    writeFileSync(join(rootDir, 'index.json'), '{}'); // the manifest is not a board
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

// --- the manifest, this module's second artifact ---
//
// A board and the list that advertises it land together. The list is what the
// game's select screen reads, so a board published without reaching it would be
// invisible to every player — a failure that looks exactly like success.

const readManifest = (rootDir) => JSON.parse(readFileSync(join(rootDir, 'index.json'), 'utf8'));

test('publishing writes the board INTO the manifest, not merely onto disk', () => {
  withStore((store, rootDir) => {
    const result = store.publish({ board: goodBoard(), slug: 'batman' });

    const manifest = readManifest(rootDir);
    assert.equal(manifest.schemaVersion, 2);
    assert.deepEqual(manifest.puzzles, [
      { slug: 'batman', id: 'asto-batman', title: 'Gotham Connections', date: TODAY },
    ]);
    // The publish result says where it landed, so the Studio can show it.
    assert.equal(result.listedAt, 0);
    assert.equal(result.listedCount, 1);
  });
});

test('a refused publish leaves the manifest exactly as it was', () => {
  withStore((store, rootDir) => {
    store.publish({ board: goodBoard(), slug: 'batman' });
    const before = readFileSync(join(rootDir, 'index.json'), 'utf8');

    const broken = goodBoard();
    delete broken.sets[0].explanation;
    assert.throws(() => store.publish({ board: broken, slug: 'broken' }), PublishRefused);

    assert.equal(readFileSync(join(rootDir, 'index.json'), 'utf8'), before);
  });
});

test('the very first refusal writes no manifest at all', () => {
  withStore((store, rootDir) => {
    assert.throws(() => store.publish({ board: goodBoard(), slug: '../escape' }), PublishRefused);
    assert.deepEqual(readdirSync(rootDir), []);
  });
});

// D-24: date order IS the order. D-10's hand-preserved play order is superseded —
// the calendar reads chronology, and chronology is not editable by reordering a file.
test('the manifest is ordered by date, whatever order the publishes came in', () => {
  withStore((store, rootDir) => {
    store.publish({ board: { ...goodBoard(), date: '2026-08-20' }, slug: 'later' });
    store.publish({ board: { ...goodBoard(), date: '2026-08-16' }, slug: 'earlier' });

    assert.deepEqual(
      readManifest(rootDir).puzzles.map((entry) => entry.slug),
      ['earlier', 'later'],
    );
  });
});

// --- the daily queue: publish assigns the date (D-24) ---

test('the first publish of a dry queue is released today, not parked in the future', () => {
  withStore((store) => {
    const result = store.publish({ board: goodBoard(), slug: 'batman' });
    assert.equal(result.date, TODAY);
    assert.equal(store.read('batman').date, TODAY);
  });
});

test('each further publish queues the next free day — five publishes, five days', () => {
  withStore((store) => {
    assert.equal(store.publish({ board: goodBoard(), slug: 'a' }).date, '2026-08-18');
    assert.equal(store.publish({ board: goodBoard(), slug: 'b' }).date, '2026-08-19');
    assert.equal(store.publish({ board: goodBoard(), slug: 'c' }).date, '2026-08-20');
  });
});

test('a stale queue does not backfill — the next publish is today, gaps stay gaps', () => {
  withStore((store) => {
    store.publish({ board: { ...goodBoard(), date: '2026-08-01' }, slug: 'old' });
    assert.equal(store.publish({ board: goodBoard(), slug: 'fresh' }).date, TODAY);
  });
});

test('a board that arrives with its own date keeps it', () => {
  withStore((store) => {
    const result = store.publish({ board: { ...goodBoard(), date: '2026-09-01' }, slug: 'scheduled' });
    assert.equal(result.date, '2026-09-01');
  });
});

test('a republish keeps the date the board already had — editing is not rescheduling', () => {
  withStore((store) => {
    store.publish({ board: goodBoard(), slug: 'batman' });
    store.publish({ board: goodBoard(), slug: 'other' }); // queue moves to the 19th

    const result = store.publish({ board: goodBoard(), slug: 'batman', replace: true });
    assert.equal(result.date, TODAY, 'a replace pushed the board to the back of the queue');
  });
});

test('a dateless board on disk is off the manifest — that is the trim mechanism', () => {
  withStore((store, rootDir) => {
    store.publish({ board: goodBoard(), slug: 'batman' });
    const parked = { ...store.read('batman'), id: 'asto-parked' };
    delete parked.date;
    writeFileSync(join(rootDir, 'parked.json'), JSON.stringify(parked, null, 2));
    store.writeManifest();

    assert.deepEqual(
      readManifest(rootDir).puzzles.map((entry) => entry.slug),
      ['batman'],
      'a dateless board reached the list',
    );
    // Still on disk, still readable — an old ?puzzle= link keeps working.
    assert.equal(store.has('parked'), true);
  });
});

test('a board deleted by hand drops out of the manifest on the next rebuild', () => {
  withStore((store, rootDir) => {
    store.publish({ board: goodBoard(), slug: 'alpha' });
    store.publish({ board: goodBoard(), slug: 'beta' });
    rmSync(join(rootDir, 'alpha.json'));

    store.writeManifest();

    assert.deepEqual(
      readManifest(rootDir).puzzles.map((entry) => entry.slug),
      ['beta'],
    );
  });
});

test('a retitled board cannot leave a stale title in the list', () => {
  withStore((store, rootDir) => {
    store.publish({ board: goodBoard(), slug: 'batman' });
    writeFileSync(
      join(rootDir, 'batman.json'),
      // A hand-edit keeps the date — dropping it would deliberately unlist the board.
      JSON.stringify({ ...goodBoard(), id: 'asto-batman', title: 'Gotham, Revisited', date: TODAY }, null, 2),
    );

    store.writeManifest();

    assert.equal(readManifest(rootDir).puzzles[0].title, 'Gotham, Revisited');
  });
});

test('a hand-edited manifest listing the same board twice is repaired, not propagated', () => {
  withStore((store, rootDir) => {
    store.publish({ board: goodBoard(), slug: 'batman' });
    const doubled = readManifest(rootDir);
    doubled.puzzles = [...doubled.puzzles, ...doubled.puzzles];
    writeFileSync(join(rootDir, 'index.json'), JSON.stringify(doubled, null, 2));

    assert.equal(store.writeManifest().puzzles.length, 1);
  });
});

test('a manifest that is unreadable garbage is rebuilt rather than fatal', () => {
  withStore((store, rootDir) => {
    store.publish({ board: goodBoard(), slug: 'batman' });
    writeFileSync(join(rootDir, 'index.json'), 'not json at all');

    assert.equal(store.readManifest(), null);
    assert.deepEqual(
      store.writeManifest().puzzles.map((entry) => entry.slug),
      ['batman'],
    );
  });
});

test('the tutorial is on disk but never in the list', () => {
  withStore((store, rootDir) => {
    store.publish({ board: goodBoard(), slug: 'tutorial' });
    store.publish({ board: goodBoard(), slug: 'batman' });

    assert.equal(store.has('tutorial'), true);
    assert.ok(store.list().some((entry) => entry.slug === 'tutorial'), 'list reports what is on disk');
    assert.deepEqual(
      readManifest(rootDir).puzzles.map((entry) => entry.slug),
      ['batman'],
      'the tutorial reached the player-facing list',
    );
  });
});

// --- reschedule: the launch tool's one verb (D-24) ---

test('reschedule moves a board to a new day, in the file and the list together', () => {
  withStore((store, rootDir) => {
    store.publish({ board: goodBoard(), slug: 'batman' });
    store.reschedule('batman', '2026-09-01');

    assert.equal(store.read('batman').date, '2026-09-01');
    assert.equal(readManifest(rootDir).puzzles[0].date, '2026-09-01');
  });
});

test('reschedule to null unpublishes — off the list, still on disk', () => {
  withStore((store, rootDir) => {
    store.publish({ board: goodBoard(), slug: 'batman' });
    store.reschedule('batman', null);

    assert.equal('date' in store.read('batman'), false);
    assert.deepEqual(readManifest(rootDir).puzzles, []);
    assert.equal(store.has('batman'), true, 'the file left the disk');
  });
});

test('reschedule refuses a day another board already holds', () => {
  withStore((store) => {
    store.publish({ board: goodBoard(), slug: 'a' }); // today
    store.publish({ board: goodBoard(), slug: 'b' }); // tomorrow
    assert.throws(
      () => store.reschedule('b', TODAY),
      (error) => error instanceof PublishRefused && error.reason === 'occupied',
    );
    assert.equal(store.read('b').date, '2026-08-19', 'a refusal must write nothing');
  });
});

test('reschedule refuses a slug with no board behind it', () => {
  withStore((store) => {
    assert.throws(() => store.reschedule('missing', '2026-09-01'), PublishRefused);
  });
});

test('rebuilding an unchanged manifest is a no-op — the tool can be run any time', () => {
  withStore((store, rootDir) => {
    store.publish({ board: goodBoard(), slug: 'batman' });
    const before = readFileSync(join(rootDir, 'index.json'), 'utf8');

    store.writeManifest();
    store.writeManifest();

    assert.equal(readFileSync(join(rootDir, 'index.json'), 'utf8'), before);
  });
});
