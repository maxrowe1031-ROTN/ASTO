// A tiny declarative structure checker — the zero-dependency stand-in for a
// JSON Schema library. Every agent's output schema is written in this
// dialect and validated locally, whatever the transport claims to support.
//
// Convention matches validate-puzzle.js: pure, never throws, returns
// { ok, errors: [{ path, message }] } and collects every problem.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkSchema } from '../../studio/schema-check.js';

const paths = (result) => result.errors.map((e) => e.path);

test('a matching object passes with no errors', () => {
  const schema = {
    type: 'object',
    required: ['name'],
    properties: { name: { type: 'string' }, count: { type: 'integer' } },
  };
  assert.deepEqual(checkSchema({ name: 'lantern', count: 2 }, schema), { ok: true, errors: [] });
});

test('missing required fields are reported by path', () => {
  const schema = {
    type: 'object',
    required: ['a', 'b'],
    properties: { a: { type: 'string' }, b: { type: 'string' } },
  };
  const result = checkSchema({}, schema);
  assert.equal(result.ok, false);
  assert.deepEqual(paths(result).sort(), ['a', 'b']);
});

test('every problem is collected, not just the first', () => {
  const schema = {
    type: 'object',
    properties: { a: { type: 'string' }, b: { type: 'integer' }, c: { type: 'boolean' } },
  };
  const result = checkSchema({ a: 1, b: 'two', c: 'three' }, schema);
  assert.equal(result.errors.length, 3);
});

test('type mismatches name the expected type', () => {
  const result = checkSchema({ n: 'seven' }, {
    type: 'object',
    properties: { n: { type: 'integer' } },
  });
  assert.match(result.errors[0].message, /integer/);
});

test('an integer field rejects a float', () => {
  const schema = { type: 'object', properties: { n: { type: 'integer' } } };
  assert.equal(checkSchema({ n: 3 }, schema).ok, true);
  assert.equal(checkSchema({ n: 3.5 }, schema).ok, false);
});

test('arrays are checked element by element, with indexed paths', () => {
  const schema = {
    type: 'object',
    properties: { words: { type: 'array', items: { type: 'string' } } },
  };
  const result = checkSchema({ words: ['ok', 4, 'fine', null] }, schema);
  assert.deepEqual(paths(result), ['words[1]', 'words[3]']);
});

test('nested objects report dotted paths', () => {
  const schema = {
    type: 'object',
    properties: {
      set: {
        type: 'object',
        required: ['difficulty'],
        properties: { difficulty: { type: 'integer' } },
      },
    },
  };
  assert.deepEqual(paths(checkSchema({ set: {} }, schema)), ['set.difficulty']);
});

test('arrays of objects combine both path styles', () => {
  const schema = {
    type: 'array',
    items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
  };
  assert.deepEqual(paths(checkSchema([{ id: 'a' }, {}], schema)), ['[1].id']);
});

test('minItems and maxItems bound array length', () => {
  const schema = { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 };
  assert.equal(checkSchema(['a'], schema).ok, false);
  assert.equal(checkSchema(['a', 'b'], schema).ok, true);
  assert.equal(checkSchema(['a', 'b', 'c', 'd'], schema).ok, false);
});

test('enum restricts to listed values and names them in the message', () => {
  const schema = { type: 'string', enum: ['green', 'yellow'] };
  assert.equal(checkSchema('green', schema).ok, true);
  const result = checkSchema('purple', schema);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /green/);
});

test('minimum and maximum bound numbers — difficulty is 1 to 4', () => {
  const schema = { type: 'integer', minimum: 1, maximum: 4 };
  assert.equal(checkSchema(1, schema).ok, true);
  assert.equal(checkSchema(4, schema).ok, true);
  assert.equal(checkSchema(0, schema).ok, false);
  assert.equal(checkSchema(5, schema).ok, false);
});

test('a string field rejects empty and whitespace-only when minLength is 1', () => {
  const schema = { type: 'string', minLength: 1 };
  assert.equal(checkSchema('a', schema).ok, true);
  assert.equal(checkSchema('', schema).ok, false);
  assert.equal(checkSchema('   ', schema).ok, false);
});

test('null is never silently accepted for an object', () => {
  assert.equal(checkSchema(null, { type: 'object', properties: {} }).ok, false);
});

test('an array is not an object and an object is not an array', () => {
  assert.equal(checkSchema([], { type: 'object', properties: {} }).ok, false);
  assert.equal(checkSchema({}, { type: 'array', items: { type: 'string' } }).ok, false);
});

test('unknown properties are allowed by default but rejected when sealed', () => {
  const open = { type: 'object', properties: { a: { type: 'string' } } };
  assert.equal(checkSchema({ a: 'x', extra: 1 }, open).ok, true);
  const sealed = { ...open, additionalProperties: false };
  const result = checkSchema({ a: 'x', extra: 1 }, sealed);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /extra/);
});

test('checkSchema never throws, whatever it is handed', () => {
  for (const junk of [undefined, null, 42, 'text', [], {}, Symbol.iterator]) {
    assert.doesNotThrow(() => checkSchema(junk, { type: 'object', properties: {} }));
  }
});
