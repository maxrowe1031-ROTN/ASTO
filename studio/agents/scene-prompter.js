// Scene Prompter (design.md D-31) — authors the image prompt for ONE register
// in ONE state. Pure: it writes text and reads text, exactly like the nine
// board agents, and knows nothing about rendering, files, or cost.
//
// WHY THIS AGENT IS HARDER THAN IT LOOKS. The band is a hostile canvas. It is
// 375×60 — 6.25:1 — and no image API emits that aspect; the widest common size
// is 3:2. So a render is always a wider frame that gets CROPPED, which means
// the composition has to be forced in the prompt rather than chosen by the
// canvas: content in a horizontal band through the middle, dead sky above,
// plain ground below. A scene that ignores this survives generation and dies
// at the crop.
//
// AND MOCHI IS IN THE SCENE (D-31, Max's call over Claude's recommendation).
// The safe design was a fixed sprite composited over a generated background,
// which makes character consistency unbreakable because the model never draws
// the cat. Max chose generation, because his scene tests work precisely BECAUSE
// Mochi is holding the magnifying glass. The cost of that choice lands here:
// every prompt must carry Mochi's identity, and the validator below enforces
// the two things that cannot be left to chance — that Mochi is named at all,
// and that the red scarf survives. D-7's lesson, again: an instruction is only
// a request, so anything load-bearing is checked as well as asked for.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

export const id = 'scene-prompter';
export const stageId = '01-scene-prompter';

/** The band, in the only terms that survive a crop. */
export const BAND = Object.freeze({ width: 375, height: 60, ratio: '6.25:1' });

const MIN_PROMPT_LENGTH = 120;

// Mochi's identity, lifted from docs/art/mochi-concept-prompt.md. Held here as
// one string so every state's prompt carries the same bible verbatim — drift
// between states would produce three different cats for one register.
const MOCHI_BIBLE = [
  'MOCHI — the character, identical in every scene:',
  '- a small white cat with a SMALL RED SCARF (#D94B3D). The scarf is the signature and is never omitted, never recoloured.',
  '- rounded compact body, slightly oversized head, upright triangular ears with soft pink inner ears',
  '- medium-large expressive oval eyes, tiny nose, small mouth, simple whiskers, curved expressive tail',
  '- cozy, clever, curious, encouraging, slightly mischievous; obsessed with coffee',
  '- clean 2D mascot illustration: flat or lightly shaded, soft polished linework',
].join('\n');

// Max's Avoid list, also from the concept brief. Stated as prohibitions
// because image models honour explicit negatives far better than implied ones.
const AVOID = [
  'AVOID: photorealistic or realistic rendering; detailed fur texture; stripes or tabby markings;',
  'complex clothing or extra accessories; changing the scarf; changing Mochi\'s proportions;',
  'tiny facial features; resemblance to existing famous mascots; Mochi pasted flat on top of a',
  'background instead of belonging in the place.',
].join(' ');

// The three states, each with the mood the reaction sheet already establishes.
const STATES = Object.freeze({
  idle: {
    mood: 'content and curious — relaxed, looking around, enjoying the place. Calm, not sleepy.',
    body: 'settled pose: sitting, loafing, or gently investigating something nearby.',
  },
  miss: {
    mood: 'disappointed but not defeated — ears droop, shoulders slump, a small wince. Gentle and sympathetic, never punishing.',
    body: 'lowered pose: sitting back, head dipped, tail low.',
  },
  solved: {
    mood: 'delighted and proud — celebrating the "aha", joyful and excited.',
    body: 'upward pose: hopping, paws raised, tail up.',
  },
});

export function listStates() {
  return Object.keys(STATES);
}

const SCHEMA = {
  type: 'object',
  required: ['scene'],
  properties: {
    scene: {
      type: 'object',
      required: ['register', 'state', 'prompt', 'composition', 'clearSide', 'mochiPose'],
      properties: {
        register: { type: 'string', minLength: 1 },
        state: { type: 'string', minLength: 1 },
        prompt: { type: 'string', minLength: MIN_PROMPT_LENGTH },
        composition: { type: 'string', minLength: 1 },
        clearSide: { type: 'string', minLength: 1 },
        mochiPose: { type: 'string', minLength: 1 },
      },
    },
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

export function buildPrompt(input = {}, context) {
  const { register = null, state = 'idle' } = input;

  const spec = STATES[state];
  // Refused rather than defaulted: a silently-substituted state would produce a
  // correct-looking image for the wrong feeling, and nothing downstream could
  // tell. Better to fail at the cheapest possible moment.
  if (!spec) {
    throw new Error(
      `unknown state: ${state} — expected one of ${Object.keys(STATES).join(', ')}`,
    );
  }

  return composePrompt({
    role:
      'You are the Scene Prompter for ASTO, a cozy word-analogy puzzle. You write the image-generation ' +
      'prompt for one illustrated scene. You do not draw; you describe, precisely enough that a ' +
      'competent illustrator would produce the same picture twice.',
    context,
    task: [
      `THE STATE: ${state}. Mochi is ${spec.mood}`,
      `Pose: ${spec.body}`,
      '',
      MOCHI_BIBLE,
      '',
      `THE CANVAS — read this twice. The final image is a band ${BAND.width}×${BAND.height} pixels, a ` +
        `${BAND.ratio} letterbox. No image generator produces that shape, so your prompt must describe a ` +
        'WIDER frame whose content is deliberately confined to a horizontal band through the vertical ' +
        'centre, with empty sky or wall above and plain ground below. Everything that matters must ' +
        'survive a crop to that letterbox. Consequences you must design for:',
      '- ONE horizontal organising line the eye reads left to right: a horizon, a counter, a shelf, a path.',
      '- Mochi is the SUBJECT and occupies most of the band height. The place is setting, not subject.',
      `- Detail budget is set by HEIGHT, not width: a prop must read at ${BAND.height}px tall. One large ` +
        'silhouetted prop reads; a cluttered tabletop becomes mush.',
      '- Nothing important in the far left or right — the band is full-bleed and the edges get trimmed.',
      '- ONE SIDE must stay visually quiet (empty sky, plain wall). The game prints status text there, ' +
        'and Mochi needs somewhere to move into. Name that side in `clearSide`.',
      '',
      'THE PALETTE — the ASTO core palette. Warm, cozy, low-contrast:',
      '#D94B3D scarf red · #4F6B47 green · #F0E6D2 cream · #E6C76A yellow · #8F4227 brown · #40342A near-black.',
      '',
      AVOID,
      '',
      'Write the scene so Mochi BELONGS in it — interacting with the place, not standing in front of it.',
    ].join('\n'),
    data: register ? asJsonBlock('The register to illustrate', register) : '',
    outputRules: [
      'Return JSON shaped exactly:',
      '{"scene":{"register":"<the register id, echoed>","state":"<the state, echoed>",' +
        '"prompt":"<the full image-generation prompt>","composition":"<one sentence on how the ' +
        'band crop is protected>","clearSide":"left|right","mochiPose":"<a few words>"}}',
      JSON_ONLY,
    ].join('\n'),
  });
}

export function parse(text) {
  return parseJson(text);
}

export function validateOutput(output, { input = null } = {}) {
  const askedRegister = input?.register?.id ?? null;
  const askedState = input?.state ?? null;

  return validateAgainst(output, SCHEMA, [
    // The agent is asked for one register in one state; anything else means the
    // reply drifted, and a drifted scene filed under the right key is worse
    // than no scene at all.
    (value) => {
      const errors = [];
      const scene = value.scene;
      if (askedRegister && scene.register !== askedRegister) {
        errors.push(`scene.register is "${scene.register}" but "${askedRegister}" was asked for`);
      }
      if (askedState && scene.state !== askedState) {
        errors.push(`scene.state is "${scene.state}" but "${askedState}" was asked for`);
      }
      return errors;
    },

    // D-31's central risk, checked rather than hoped for: Mochi is IN the
    // scene, and the scarf is the signature that makes Mochi recognisable at
    // 60px. A prompt missing either produces a picture of a place, or a
    // picture of some other white cat.
    (value) => {
      const errors = [];
      const prompt = value.scene.prompt ?? '';
      if (!/mochi/i.test(prompt)) {
        errors.push('scene.prompt never names Mochi — D-31 puts Mochi in the scene, not beside it');
      }
      if (!/scarf/i.test(prompt)) {
        errors.push('scene.prompt drops the red scarf — it is the signature and is never omitted');
      }
      return errors;
    },

    // The status strip and Mochi's movement both need a quiet side, and
    // "middle" is not a side.
    (value) => {
      const side = value.scene.clearSide;
      return side === 'left' || side === 'right'
        ? []
        : [`scene.clearSide is "${side}" — must be "left" or "right"`];
    },
  ]);
}
