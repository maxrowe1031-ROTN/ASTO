// A valid schema-v1.0 board used by the engine suites.
//
// Deliberately separate from puzzles/first-light.json: engine tests assert engine
// behaviour, and must not start failing because a content edit changed a word.

export const board = {
  id: 'test-board',
  title: 'Test Board',
  sets: [
    {
      id: 'set-growth',
      relationshipLabel: 'Small origin becomes larger result',
      explanation: 'A seed grows into a tree the way a spark grows into a fire.',
      pairs: [['Seed', 'Tree'], ['Spark', 'Fire']],
      difficulty: 1
    },
    {
      id: 'set-tools',
      relationshipLabel: 'Tool used by profession',
      explanation: 'A brush is a painter’s tool the way a chisel is a sculptor’s.',
      pairs: [['Brush', 'Painter'], ['Chisel', 'Sculptor']],
      difficulty: 2
    },
    {
      id: 'set-homes',
      relationshipLabel: 'Home of animal',
      explanation: 'A nest houses a bird the way a den houses a bear.',
      pairs: [['Nest', 'Bird'], ['Den', 'Bear']],
      difficulty: 3
    },
    {
      id: 'set-material',
      relationshipLabel: 'Material transformed into finished object',
      explanation: 'Dough becomes bread the way clay becomes pottery.',
      pairs: [['Dough', 'Bread'], ['Clay', 'Pottery']],
      difficulty: 4
    }
  ]
};

/** Four words that belong to four different sets — always a plain miss. */
export const MISS = ['Seed', 'Painter', 'Nest', 'Dough'];

/**
 * Distinct orderings of the MISS words — every one is a fresh miss that charges a
 * mistake. Needed since the already-tried rule made repeating an identical order free.
 */
export function distinctMisses(count) {
  const perms = [];
  const build = (rest, chosen) => {
    if (rest.length === 0) {
      perms.push(chosen);
      return;
    }
    for (let i = 0; i < rest.length && perms.length < count; i += 1) {
      build(rest.toSpliced(i, 1), [...chosen, rest[i]]);
    }
  };
  build(MISS, []);
  return perms;
}
