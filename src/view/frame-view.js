// The analogy frame: ___ : ___ :: ___ : ___. READ-ONLY — renders the selection, emits
// deselect and reorder intents.
//
// Four stable slots (persistent nodes, like the board). The next empty slot glows honey.
// Tap a filled slot to deselect its term. Drag a filled slot onto another to reorder —
// Pointer Events + setPointerCapture, never HTML5 DnD (broken on iOS). Drag is additive:
// every path through the game works by taps alone.
//
// Mid-drag visuals are transient view state; the reorder becomes game state only when
// the drop commits through the controller (order decides so-close vs solved).

const DRAG_THRESHOLD_PX = 6;

export class FrameView {
  constructor(root, { onSlotTap, onReorder }) {
    root.innerHTML = `
      <div class="frame-slot" data-slot="0"></div><span class="sep">:</span>
      <div class="frame-slot" data-slot="1"></div><span class="sep">::</span>
      <div class="frame-slot" data-slot="2"></div><span class="sep">:</span>
      <div class="frame-slot" data-slot="3"></div>`;
    this.slots = [...root.querySelectorAll('.frame-slot')];
    this.onSlotTap = onSlotTap;
    this.onReorder = onReorder;
    this.drag = null;

    this.slots.forEach((slot, index) => {
      slot.addEventListener('pointerdown', (e) => this.pointerDown(e, slot, index));
      slot.addEventListener('pointermove', (e) => this.pointerMove(e));
      slot.addEventListener('pointerup', (e) => this.pointerUp(e));
      slot.addEventListener('pointercancel', () => this.endDrag());
    });
  }

  update(state) {
    this.filledCount = state.selectedTerms.length;
    this.slots.forEach((slot, i) => {
      const term = state.selectedTerms[i];
      slot.textContent = term ?? '';
      slot.classList.toggle('filled', term !== undefined);
      slot.classList.toggle('next', state.status === 'playing' && i === state.selectedTerms.length);
    });
  }

  pointerDown(event, slot, index) {
    if (!slot.classList.contains('filled')) return;
    try {
      slot.setPointerCapture(event.pointerId);
    } catch {
      // Capture keeps move/up events flowing to this slot mid-drag; if the pointer is
      // already gone (or synthetic), losing capture must not break the tap path.
    }
    this.drag = { slot, index, startX: event.clientX, startY: event.clientY, moved: false };
  }

  pointerMove(event) {
    if (!this.drag) return;
    const dx = event.clientX - this.drag.startX;
    const dy = event.clientY - this.drag.startY;

    if (!this.drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      this.drag.moved = true;
      this.drag.slot.classList.add('dragging');
    }
    if (!this.drag.moved) return;

    this.drag.slot.style.transform = `translate(${dx}px, ${dy}px)`;
    const target = this.slotIndexAt(event.clientX, event.clientY);
    this.slots.forEach((s, i) =>
      s.classList.toggle('drop-target', i === target && i !== this.drag.index && i < this.filledCount)
    );
  }

  pointerUp(event) {
    if (!this.drag) return;
    const { index, moved } = this.drag;
    const target = this.slotIndexAt(event.clientX, event.clientY);
    this.endDrag();

    if (!moved) {
      this.onSlotTap(index); // a press without movement is the tap/deselect path
    } else if (target !== null && target !== index && target < this.filledCount) {
      this.onReorder(index, target);
    }
  }

  endDrag() {
    if (!this.drag) return;
    this.drag.slot.classList.remove('dragging');
    this.drag.slot.style.transform = '';
    this.slots.forEach((s) => s.classList.remove('drop-target'));
    this.drag = null;
  }

  slotIndexAt(x, y) {
    // Hit-test the slot rectangles directly — but skip the slot being dragged: its
    // rect is transformed to ride under the pointer, so it would always be the hit
    // (the same trap elementFromPoint has).
    for (let i = 0; i < this.slots.length; i += 1) {
      if (this.drag && i === this.drag.index) continue;
      const r = this.slots[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return null;
  }
}
