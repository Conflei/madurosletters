export interface InputHandlers {
  onPan(dx: number, dy: number): void;
  onZoom(factor: number, x: number, y: number): void;
  onTap(x: number, y: number): void;
  /** Mouse moved without a button held; null when it leaves the element. */
  onHover(x: number | null, y: number | null): void;
}

interface PointerState {
  x: number;
  y: number;
}

const TAP_SLOP = 8;

/** Unified mouse + touch input: one-finger drag pans, pinch / wheel zooms, a short press taps. */
export class PointerInput {
  private pointers = new Map<number, PointerState>();
  private downAt: PointerState | null = null;
  private moved = false;
  private lastPinch = { dist: 0, x: 0, y: 0 };

  constructor(
    private el: HTMLElement,
    private handlers: Partial<InputHandlers>,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', () => this.handlers.onHover?.(null, null));
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private local(e: PointerEvent | WheelEvent): PointerState {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private onDown = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.downAt = p;
      this.moved = false;
    } else if (this.pointers.size === 2) {
      this.moved = true;
      this.lastPinch = this.pinchState();
    }
  };

  private onMove = (e: PointerEvent) => {
    const p = this.local(e);
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') this.handlers.onHover?.(p.x, p.y);
      return;
    }
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size === 1) {
      if (!this.moved && this.downAt && Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) > TAP_SLOP) {
        this.moved = true;
      }
      if (this.moved) this.handlers.onPan?.(p.x - prev.x, p.y - prev.y);
    } else if (this.pointers.size === 2) {
      const pinch = this.pinchState();
      if (this.lastPinch.dist > 0) this.handlers.onZoom?.(pinch.dist / this.lastPinch.dist, pinch.x, pinch.y);
      this.handlers.onPan?.(pinch.x - this.lastPinch.x, pinch.y - this.lastPinch.y);
      this.lastPinch = pinch;
    }
  };

  private onUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0 && !this.moved) this.handlers.onTap?.(p.x, p.y);
    if (this.pointers.size === 1) {
      this.downAt = [...this.pointers.values()][0];
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.local(e);
    this.handlers.onZoom?.(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  };
}
