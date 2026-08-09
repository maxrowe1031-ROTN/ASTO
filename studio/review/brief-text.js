// brief-text.js — a proposal rendered as the plain text a revision travels as.
//
// Extracted from review.js (2026-08-09, D-14) because the auto-revise loop
// sends a brief through `requestRevision` exactly the way the review page
// does when Max clicks "send" — and two renderings of the same brief would
// drift into two different revisions. Pure on purpose: the review page (a
// browser module) and auto-revise.js (a node module) both import it, so it
// may touch neither the DOM nor the filesystem.

/**
 * The proposal as the plain text a revision actually travels as.
 *
 * `protectedReason` is why the doNotChange sets are protected. The default is
 * the review page's truth — Max praised them — and the auto-revise loop passes
 * its own, because in a pre-review brief nothing has been approved by anyone
 * and the notes must not claim otherwise to the stages that read them.
 */
export function briefText(proposal, { protectedReason = 'these were approved' } = {}) {
  return [
    proposal.summary,
    ...proposal.fixes.map(
      (fix) => `- ${fix.setId}: ${fix.problem}\n  Try: ${fix.candidates.join('\n  Or: ')}`,
    ),
    proposal.doNotChange?.length
      ? `Do not change: ${proposal.doNotChange.join(', ')} — ${protectedReason}.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
