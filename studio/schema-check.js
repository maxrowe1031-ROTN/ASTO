// A minimal declarative structure checker — the zero-dependency stand-in for
// a JSON Schema library.
//
// Deliberately small: it supports exactly the constructs the agent output
// schemas need (type, required, properties, items, enum, length and numeric
// bounds, sealed objects) and nothing more. Structured-output support in the
// API is a convenience; this is the authority.
//
// PURE — imports nothing, throws nothing. Returns { ok, errors:[{path,message}] }
// and collects every problem, matching validate-puzzle.js.

export function checkSchema(value, schema) {
  const errors = [];
  check(value, schema, '', errors);
  return { ok: errors.length === 0, errors };
}

function check(value, schema, path, errors) {
  const fail = (message) => errors.push({ path, message });

  if (!isPlainObject(schema)) {
    fail('schema must be an object');
    return;
  }

  if (!hasType(value, schema.type)) {
    fail(`expected ${schema.type}, received ${describe(value)}`);
    return; // further checks would be noise against the wrong type
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    fail(`must be one of ${schema.enum.join(', ')}; received ${describe(value)}`);
  }

  switch (schema.type) {
    case 'string':
      if (typeof schema.minLength === 'number' && value.trim().length < schema.minLength) {
        fail(`must be at least ${schema.minLength} character(s) after trimming`);
      }
      break;

    case 'integer':
    case 'number':
      if (typeof schema.minimum === 'number' && value < schema.minimum) {
        fail(`must be at least ${schema.minimum}; received ${value}`);
      }
      if (typeof schema.maximum === 'number' && value > schema.maximum) {
        fail(`must be at most ${schema.maximum}; received ${value}`);
      }
      break;

    case 'array':
      if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
        fail(`must hold at least ${schema.minItems} item(s); received ${value.length}`);
      }
      if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
        fail(`must hold at most ${schema.maxItems} item(s); received ${value.length}`);
      }
      if (schema.items) {
        value.forEach((item, i) => check(item, schema.items, `${path}[${i}]`, errors));
      }
      break;

    case 'object': {
      const properties = schema.properties ?? {};
      for (const key of schema.required ?? []) {
        if (!(key in value)) errors.push({ path: join(path, key), message: 'required' });
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!(key in properties)) {
            errors.push({ path: join(path, key), message: `unexpected property "${key}"` });
          }
        }
      }
      for (const [key, subSchema] of Object.entries(properties)) {
        if (key in value) check(value[key], subSchema, join(path, key), errors);
      }
      break;
    }

    default:
      break;
  }
}

const join = (path, key) => (path === '' ? key : `${path}.${key}`);

function hasType(value, type) {
  switch (type) {
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return true; // no type constraint stated
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
