// Fit a term to its box: step the font size down only as far as it must.
//
// Presentation only. A view calls fitTerm after painting a term; nothing in the engine
// knows how wide a word is. The chooser is pure. fitTerm takes a measurer so node:test
// can drive it with a fake; the default measurer is the DOM one below.
//
// Why measure instead of counting letters: at the same length "measurements" needs
// 10px in a 78px tile and "kindergarten" fits at 12px. Letters are not widths.
//
// Why a Range and not scrollWidth: a <button> never reports overflow through
// scrollWidth in Chrome (its contents sit in an anonymous centred box), so the tile fit
// silently did nothing on the first pass. The text's own rectangle does not lie.
//
// Below the floor the stylesheet takes over (hyphens: auto; overflow-wrap: anywhere),
// so the worst case is a hyphenated second line, never a bare mid-word break.

/** The largest size in [max..min] that fits, or min when none does. Never measures
 *  below max when max fits. */
export function chooseSize({ fits, max, min }) {
  for (let size = max; size > min; size -= 1) {
    if (fits(size)) return size;
  }
  return min;
}

/** { text, box } in px: the term's single-line width, and the width it has to fit in. */
export function measureDom(el) {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  const text = range.getBoundingClientRect().width;
  // Fractional, not clientWidth: that rounds to a whole pixel, and a text 0.3px too
  // wide for the real box would pass and still wrap. Half a pixel of margin on top.
  const style = el.ownerDocument.defaultView.getComputedStyle(el);
  const inset = ['borderLeftWidth', 'borderRightWidth', 'paddingLeft', 'paddingRight']
    .reduce((sum, prop) => sum + Number.parseFloat(style[prop]), 0);
  const box = el.getBoundingClientRect().width - inset - 0.5;
  return { text, box };
}

/** Measure on one line, then leave the inline size empty when the stylesheet's own
 *  size fits — so only long words carry an inline override. Returns the size chosen. */
export function fitTerm(el, { max = 14, min = 10, measure = measureDom } = {}) {
  // The box is read BEFORE forcing one line: a grid column with an auto minimum
  // widens to a nowrap word, so measuring both together always says "fits".
  const whiteSpace = el.style.whiteSpace;
  el.style.fontSize = '';
  const { box } = measure(el);
  el.style.whiteSpace = 'nowrap';
  const fits = (size) => {
    el.style.fontSize = `${size}px`;
    return measure(el).text <= box;
  };
  const size = chooseSize({ fits, max, min });
  el.style.fontSize = size === max ? '' : `${size}px`;
  el.style.whiteSpace = whiteSpace;
  return size;
}
