// Canonical puzzle schema v1.0 validator. PURE — imports nothing, throws nothing.
//
// It deliberately derives its own word list rather than importing arrangements.js: this
// module is the boundary check that runs before anything trusts a file, so it stays
// standalone.
//
// Returns { ok, errors: [{ path, message }] } and collects EVERY problem, because an
// author fixing a board wants the whole list, not the first line.

const V1 = 'schema v1.0';

const LEGACY_BOARD_FIELDS = {
  words: `${V1} has no \`words[]\` — the sixteen board words are derived from each set's \`pairs\`.`,
  theme: `\`theme\` is not part of ${V1}.`,
  difficulty_model: `\`difficulty_model\` is not part of ${V1} — tiers derive from \`difficulty\` 1–4.`,
  relationship_label: `snake_case \`relationship_label\` is pre-${V1}; use camelCase \`relationshipLabel\`.`
};

const LEGACY_SET_FIELDS = {
  tier: `${V1} has no \`tier\` field — the tier derives from \`difficulty\` 1–4.`,
  relationship_label: `snake_case \`relationship_label\` is pre-${V1}; use camelCase \`relationshipLabel\`.`,
  notes: `\`notes\` is not part of ${V1} — author commentary belongs in \`explanation\`.`
};

export function validatePuzzle(puzzle) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, message });

  if (!isObject(puzzle)) {
    fail('', `A ${V1} puzzle must be a JSON object.`);
    return { ok: false, errors };
  }

  for (const [field, message] of Object.entries(LEGACY_BOARD_FIELDS)) {
    if (field in puzzle) fail(field, message);
  }

  if (!isText(puzzle.id)) fail('id', 'Required: a non-empty string id.');
  if (!isText(puzzle.title)) fail('title', 'Required: a non-empty string title.');
  if ('date' in puzzle && !isText(puzzle.date)) {
    fail('date', 'Optional, but when present must be a non-empty string.');
  }

  if (!Array.isArray(puzzle.sets)) {
    fail('sets', 'Required: an array of exactly four sets, one per difficulty 1–4.');
    return { ok: false, errors };
  }
  if (puzzle.sets.length !== 4) {
    fail('sets', `A board must contain exactly four sets, one per difficulty 1–4; found ${puzzle.sets.length}.`);
  }

  const seenSetIds = new Set();
  const difficulties = [];
  const words = [];

  puzzle.sets.forEach((set, i) => {
    const at = `sets[${i}]`;
    if (!isObject(set)) {
      fail(at, 'Each set must be an object.');
      return;
    }

    for (const [field, message] of Object.entries(LEGACY_SET_FIELDS)) {
      if (field in set) fail(`${at}.${field}`, message);
    }

    if (!isText(set.id)) {
      fail(`${at}.id`, 'Required: a non-empty string id.');
    } else if (seenSetIds.has(set.id)) {
      fail(`${at}.id`, `Duplicate set id "${set.id}" — set ids must be unique within a board.`);
    } else {
      seenSetIds.add(set.id);
    }

    if (!isText(set.relationshipLabel)) {
      fail(`${at}.relationshipLabel`, 'Required: the label shown on the solved card.');
    }
    if (!isText(set.explanation)) {
      fail(`${at}.explanation`, 'Required: the loss screen reveals unsolved sets with their explanation.');
    }

    if (!Number.isInteger(set.difficulty) || set.difficulty < 1 || set.difficulty > 4) {
      fail(`${at}.difficulty`, `Required: an integer 1–4; received ${JSON.stringify(set.difficulty)}.`);
    } else {
      difficulties.push(set.difficulty);
    }

    if ('baitTags' in set && !(Array.isArray(set.baitTags) && set.baitTags.every(isText))) {
      fail(`${at}.baitTags`, 'Optional, but when present must be an array of non-empty strings.');
    }

    words.push(...validatePairs(set.pairs, at, fail));
  });

  if (difficulties.length === 4 && new Set(difficulties).size !== 4) {
    fail('sets', 'Each difficulty 1–4 must be used exactly once — one set per tier.');
  }

  if (puzzle.sets.length === 4 && words.length === 16) {
    const repeated = duplicatesIgnoringCase(words);
    if (repeated.length > 0) {
      fail('sets', `Board words must all be distinct; repeated: ${repeated.join(', ')}.`);
    }
  }

  // Optional glossary (D-18): an editorially authored definition for the board's
  // hardest word. Data, not a dictionary — the game is offline and zero-dep, and
  // a gloss must be leak-checked editorially. Absent on every pre-D-18 board.
  if ('glossary' in puzzle) {
    if (!Array.isArray(puzzle.glossary)) {
      fail('glossary', 'Optional, but when present must be an array of { word, definition }.');
    } else {
      const onBoard = new Set(words.map((word) => word.toLowerCase()));
      puzzle.glossary.forEach((entry, i) => {
        if (!isObject(entry)) {
          fail(`glossary[${i}]`, 'Each glossary entry must be an object { word, definition }.');
          return;
        }
        if (!isText(entry.word)) {
          fail(`glossary[${i}].word`, 'Required: a non-empty string naming a board word.');
        } else if (words.length === 16 && !onBoard.has(entry.word.toLowerCase())) {
          fail(`glossary[${i}].word`, `"${entry.word}" is not one of the sixteen board words.`);
        }
        if (!isText(entry.definition)) {
          fail(`glossary[${i}].definition`, 'Required: a non-empty definition.');
        }
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Returns the words it could read, so word-level checks still run on a partly bad set. */
function validatePairs(pairs, at, fail) {
  if (!Array.isArray(pairs) || pairs.length !== 2) {
    fail(`${at}.pairs`, 'Required: exactly two ordered pairs — [[A, B], [C, D]].');
    return [];
  }

  const words = [];
  pairs.forEach((pair, j) => {
    if (!Array.isArray(pair) || pair.length !== 2) {
      fail(`${at}.pairs[${j}]`, 'Each pair must hold exactly two words.');
      return;
    }
    if (!pair.every(isText)) {
      fail(`${at}.pairs[${j}]`, 'Each word must be a non-empty string.');
      return;
    }
    words.push(...pair);
  });
  return words;
}

function duplicatesIgnoringCase(words) {
  const seen = new Set();
  const repeated = new Set();
  for (const word of words) {
    const key = word.toLowerCase();
    if (seen.has(key)) repeated.add(word);
    seen.add(key);
  }
  return [...repeated];
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
