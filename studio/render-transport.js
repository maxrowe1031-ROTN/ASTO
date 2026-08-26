// render-transport — the render step's injected seam (design.md D-31).
//
// llm.js proved the pattern this file copies: the transport is INJECTED, so
// swapping "Max renders by hand" for "an image API renders" changes one
// argument in the orchestrator, never an `if` inside it. Two transports will
// exist; this file holds the first.
//
// The MANUAL transport (D-31 decision 2 — ships first, costs nothing):
//   request() stages the prompt in art/pending/ through the art-store, and
//   reports 'pending'. Max pastes the prompt into an image tool, drops the
//   PNG beside it, and collect() picks it up. The transport builds no paths
//   itself — every touch of art/ goes through the store, or the store's
//   traversal guarantee means nothing.
//
// The API transport (later, its own cost conversation with Max) will return
// { status: 'rendered', bytes } from request() directly, and collect()
// becomes a no-op returning what request already produced.

export function createManualRenderTransport({ store }) {
  return {
    kind: 'manual',

    /** Stages one scene for human rendering. Never returns bytes. */
    async request({ register, state, scene, model = null }) {
      const { promptPath } = store.writePendingScene({ register, state, scene, model });
      return { status: 'pending', promptPath };
    },

    /** The dropped render's bytes, or null while Max hasn't delivered. */
    async collect(register, state) {
      return store.readPendingImage(register, state);
    },
  };
}
