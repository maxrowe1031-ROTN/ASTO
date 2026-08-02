// The editorial rules corpus — what every agent is told to follow.
//
// This file is the destination of the whole 30-iteration loop: rules arrive
// here compiled from Max's recorded feedback, each carrying provenance back to
// the runs that justified it. Until then it holds only the GDD's own standards.
//
// The load-bearing rule about rules: nothing is adopted silently. A rule with
// status other than 'approved' is inert — it can sit in the file as a proposal
// without ever reaching a prompt.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadRules, RULES_PATH } from '../../../studio/corpus/rules.js';
import { validateRulesFile } from '../../../studio/schemas.js';

const withRulesFile = (value, body) => {
  const dir = mkdtempSync(join(tmpdir(), 'asto-rules-'));
  const path = join(dir, 'rules.json');
  if (value !== null) writeFileSync(path, JSON.stringify(value, null, 2));
  try {
    return body(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const rule = (overrides = {}) => ({
  id: 'rule-001',
  text: 'Every pair in a set must share the same relationship.',
  status: 'approved',
  source: 'gdd-10.2',
  createdAt: '2026-08-02',
  ...overrides,
});

const file = (rules) => ({ schemaVersion: '1.0', rules });

test('the shipped rules file is valid and seeded from the GDD', () => {
  const rules = loadRules();
  assert.ok(rules.length >= 6, `only ${rules.length} rules`);
  // Seeded from GDD §10.2 — Max's own words, not an invented standard.
  assert.ok(rules.every((r) => r.source === 'gdd-10.2'), 'a rule arrived from somewhere else');
  assert.ok(
    rules.some((r) => /same relationship/i.test(r.text)),
    'the first editorial standard is missing',
  );
});

test('the shipped file has no rule Max has not approved', () => {
  withRulesFile(null, () => {
    const raw = loadRules(RULES_PATH, { includeProposed: true });
    assert.ok(
      raw.every((r) => r.status === 'approved'),
      'a proposed rule is sitting in the shipped corpus',
    );
  });
});

test('only approved rules are loaded — a proposal never reaches a prompt', () => {
  withRulesFile(
    file([rule(), rule({ id: 'rule-002', text: 'Proposed thing', status: 'proposed' })]),
    (path) => {
      const rules = loadRules(path);
      assert.deepEqual(rules.map((r) => r.id), ['rule-001']);
    },
  );
});

test('includeProposed surfaces everything, for the review workflow', () => {
  withRulesFile(
    file([rule(), rule({ id: 'rule-002', status: 'proposed' })]),
    (path) => {
      assert.equal(loadRules(path, { includeProposed: true }).length, 2);
    },
  );
});

test('a missing file loads as no rules, not as a crash', () => {
  withRulesFile(null, (path) => {
    assert.deepEqual(loadRules(path), []);
  });
});

test('an invalid rules file throws loudly rather than silently loading nothing', () => {
  withRulesFile(file([{ id: 'x' }]), (path) => {
    assert.throws(() => loadRules(path), /invalid rules file/);
  });
});

test('rules carry provenance, so a compiled rule can be traced to its evidence', () => {
  const compiled = rule({
    id: 'rule-020',
    source: 'feedback-batch-1',
    provenance: { runIds: ['2026-08-02T12-00-00.000Z-lantern'], tags: ['weak-label'] },
  });
  assert.equal(validateRulesFile(file([compiled])).ok, true);
});

test('the validator names every problem', () => {
  const { ok, errors } = validateRulesFile({
    schemaVersion: 'wrong',
    rules: [{ id: '', text: 42, status: 'invented' }],
  });
  assert.equal(ok, false);
  assert.ok(errors.length >= 4, `only ${errors.length} problems`);
});

test('duplicate rule ids are rejected — provenance must stay unambiguous', () => {
  const { ok, errors } = validateRulesFile(file([rule(), rule()]));
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /duplicate/i.test(e.message)));
});
