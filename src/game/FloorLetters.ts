import { fillPoly, linePx } from '../engine/draw';
import type { RemoteLetter } from '../api';
import { projectPx, type Vec2 } from '../engine/iso';

export interface FloorLetter {
  x: number;
  y: number;
  /** Lies along the x axis or the y axis. */
  turned: boolean;
  /** Offsets the sparkle so letters don't twinkle in sync. */
  phase: number;
  /** Backend id; letters without one (placeholders, the player's own) can't be voted on. */
  id?: string;
  text: string;
  from: string;
}

const MAX_LETTERS = 3;
const ARRIVE_EVERY: [number, number] = [45, 90];
/** Tap target around a letter's centre, in world pixels (generous for fingers). */
const HIT_W = 14;
const HIT_H = 10;

const LOREM = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  'Curabitur pretium tincidunt lacus. Nulla gravida orci a odio. Nullam varius, turpis et commodo pharetra, est eros bibendum elit, nec luctus magna felis sollicitudin mauris. Integer in mauris eu nibh euismod gravida.',
  'Praesent dapibus, neque id cursus faucibus, tortor neque egestas augue, eu vulputate magna eros eu erat. Aliquam erat volutpat. Nam dui mi, tincidunt quis, accumsan porttitor, facilisis luctus, metus.',
];

/** Spots on open floor; new mail lands just inside the bars. */
const START: Vec2[] = [
  { x: 2.25, y: 0.55 },
  { x: 2.45, y: 2.35 },
  { x: 1.75, y: 3.75 },
];
const ARRIVAL_AREA = { minX: 1.3, maxX: 2.7, minY: 0.3, maxY: 0.8 };
/** Open floor where the player's own letters are dropped. */
const DROP_AREA = { minX: 1.4, maxX: 2.7, minY: 0.4, maxY: 4.6 };
const UNKNOWN_SENDER = 'Remitente desconocido';

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

interface Content {
  id?: string;
  text: string;
  from: string;
}

/**
 * Envelopes lying on the cell floor, filled with approved letters from the backend (lorem ipsum
 * stand-ins until there are any). Reading one removes it; more get slipped in over time.
 */
export class FloorLetters {
  letters: FloorLetter[] = [];
  /** Asked for more letters when the pool runs dry, passing the ids already shown this session. */
  refill: ((exclude: string[]) => Promise<RemoteLetter[]>) | null = null;
  private pool: Content[] = [];
  private seen = new Set<string>();
  private lorem = false;
  private refilling = false;
  private arriveIn = rand(...ARRIVE_EVERY);
  private next = 0;

  /** First batch from the backend; an empty or failed fetch falls back to placeholders. */
  load(remote: RemoteLetter[]): void {
    this.lorem = remote.length === 0;
    this.pool = this.lorem ? [] : this.fresh(remote);
    for (const p of START) {
      const content = this.nextContent();
      if (content) this.letters.push({ ...this.make(p.x, p.y), ...content });
    }
  }

  update(dt: number): void {
    if (this.letters.length >= MAX_LETTERS) return;
    this.arriveIn -= dt;
    if (this.arriveIn > 0) return;
    this.arriveIn = rand(...ARRIVE_EVERY);
    const content = this.nextContent();
    if (!content) return;
    const a = ARRIVAL_AREA;
    this.letters.push({ ...this.make(rand(a.minX, a.maxX), rand(a.minY, a.maxY)), ...content });
  }

  /** Drops a letter on open floor, away from the ones already lying there. */
  add(text: string, from: string): void {
    const a = DROP_AREA;
    let spot = { x: rand(a.minX, a.maxX), y: rand(a.minY, a.maxY) };
    for (let tries = 0; tries < 12; tries++) {
      const clear = this.letters.every((l) => Math.hypot(l.x - spot.x, l.y - spot.y) > 0.5);
      if (clear) break;
      spot = { x: rand(a.minX, a.maxX), y: rand(a.minY, a.maxY) };
    }
    this.letters.push({ ...this.make(spot.x, spot.y), text, from });
  }

  /** Front-most letter under a world-pixel point. */
  at(world: Vec2): FloorLetter | null {
    let best: FloorLetter | null = null;
    for (const l of this.letters) {
      const c = projectPx(l.x, l.y);
      if (Math.abs(world.x - c.x) > HIT_W || Math.abs(world.y - c.y) > HIT_H) continue;
      if (!best || l.x + l.y > best.x + best.y) best = l;
    }
    return best;
  }

  take(letter: FloorLetter): void {
    this.letters = this.letters.filter((l) => l !== letter);
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    for (const l of this.letters) drawEnvelope(ctx, l, time);
  }

  private nextContent(): Content | null {
    if (this.lorem) return { text: LOREM[this.next % LOREM.length], from: UNKNOWN_SENDER };
    const content = this.pool.shift() ?? null;
    if (this.pool.length === 0) this.requestRefill();
    return content;
  }

  /** Letters not yet shown this session, so the same one doesn't keep coming back. */
  private fresh(remote: RemoteLetter[]): Content[] {
    const out = remote.filter((r) => !this.seen.has(r.id));
    for (const r of out) this.seen.add(r.id);
    return out.map((r) => ({ id: r.id, text: r.body, from: UNKNOWN_SENDER }));
  }

  private requestRefill(): void {
    if (!this.refill || this.refilling) return;
    this.refilling = true;
    this.refill([...this.seen].slice(-60))
      .then((remote) => {
        // Nothing new left: let already-seen letters come round again next time.
        if (remote.length === 0) this.seen.clear();
        this.pool.push(...this.fresh(remote));
      })
      .catch(() => {})
      .finally(() => (this.refilling = false));
  }

  private make(x: number, y: number): Omit<FloorLetter, 'text' | 'from'> {
    return { x, y, turned: this.next++ % 2 === 1, phase: Math.random() * 3 };
  }
}

/** A flat envelope on the floor plane: paper diamond, flap lines and a red seal. */
function drawEnvelope(ctx: CanvasRenderingContext2D, l: FloorLetter, time: number): void {
  const hw = l.turned ? 0.13 : 0.2;
  const hd = l.turned ? 0.2 : 0.13;
  const corners = [projectPx(l.x - hw, l.y - hd), projectPx(l.x + hw, l.y - hd), projectPx(l.x + hw, l.y + hd), projectPx(l.x - hw, l.y + hd)];
  const shadow = corners.map((p) => ({ x: p.x + 1, y: p.y + 1 }));

  fillPoly(ctx, shadow, 'rgba(0, 0, 0, 0.25)');
  fillPoly(ctx, corners, '#f6efd9');
  const c = projectPx(l.x, l.y);
  const back = l.turned ? [corners[0], corners[1]] : [corners[0], corners[3]];
  linePx(ctx, back[0], c, '#c9bd9a');
  linePx(ctx, back[1], c, '#c9bd9a');
  for (let i = 0; i < 4; i++) linePx(ctx, corners[i], corners[(i + 1) % 4], '#6e6450');
  ctx.fillStyle = '#c8322a';
  ctx.fillRect(c.x - 1, c.y - 1, 3, 2);

  // Occasional twinkle so they read as something to tap.
  const t = (time + l.phase) % 2.4;
  if (t < 0.35) {
    const s = t < 0.17 ? 1 : 2;
    const sx = c.x + 7;
    const sy = c.y - 7;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx - s, sy, s * 2 + 1, 1);
    ctx.fillRect(sx, sy - s, 1, s * 2 + 1);
  }
}
