import { fillPoly, linePx } from '../engine/draw';
import { projectPx, type Vec2 } from '../engine/iso';

export interface FloorLetter {
  x: number;
  y: number;
  /** Lies along the x axis or the y axis. */
  turned: boolean;
  /** Offsets the sparkle so letters don't twinkle in sync. */
  phase: number;
  text: string;
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

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** Envelopes lying on the cell floor. Reading one removes it; more get slipped in over time. */
export class FloorLetters {
  letters: FloorLetter[] = START.map((p, i) => this.make(p.x, p.y, i));
  private arriveIn = rand(...ARRIVE_EVERY);
  private next = START.length;

  update(dt: number): void {
    if (this.letters.length >= MAX_LETTERS) return;
    this.arriveIn -= dt;
    if (this.arriveIn > 0) return;
    this.arriveIn = rand(...ARRIVE_EVERY);
    const a = ARRIVAL_AREA;
    this.letters.push(this.make(rand(a.minX, a.maxX), rand(a.minY, a.maxY), this.next++));
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

  private make(x: number, y: number, i: number): FloorLetter {
    return { x, y, turned: i % 2 === 1, phase: Math.random() * 3, text: LOREM[i % LOREM.length] };
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
