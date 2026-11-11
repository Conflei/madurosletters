import { PAL } from '../config';
import { boxPx, boxStyle, ellipsePx } from '../engine/draw';
import { projectPx, type Vec2 } from '../engine/iso';
import { FREE_AREA, INMATE_SPOT, propOf, type Activity, type Pose } from '../world/cellMap';
import { avatarFrame, type AvatarPose } from './avatar';

const SPEED = 0.9;
const HOP_TIME = 0.4;
const WALK_FPS = 8;
const WALK_CYCLE = [1, 0, 2, 0];
const MATTRESS_Z = 21;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The on-screen inmate. Wanders the free floor when idle; given an activity he walks to the
 * prop, holds its pose (sleep, sit, wash) for a while, then steps back out.
 */
export class InmateActor {
  pos: Vec2 = { ...INMATE_SPOT };
  /** World pixel just above the top of his head, for the name tag and chat bubbles. */
  headTop: Vec2 = { x: 0, y: 0 };
  onSay: ((text: string) => void) | null = null;

  private path: Vec2[] = [];
  private activity: Activity | null = null;
  private activeFor = 0;
  private idle = 2.5;
  private facing: 1 | -1 = -1;
  private walkClock = 0;
  private hopT = 0;
  private blinkIn = 3;
  private hitBox: Box | null = null;

  private get arrived(): boolean {
    return this.activity !== null && this.path.length === 0;
  }

  get pose(): Pose {
    return this.arrived && this.activity ? this.activity.pose : 'stand';
  }

  update(dt: number): void {
    this.hopT = Math.max(0, this.hopT - dt);
    this.blinkIn -= dt;
    if (this.blinkIn < -0.15) this.blinkIn = 2 + Math.random() * 4;

    if (this.path.length) {
      this.walk(dt);
    } else if (this.activity) {
      this.activeFor -= dt;
      if (this.activeFor <= 0) {
        this.path = [this.activity.approach];
        this.activity = null;
      }
    } else {
      this.idle -= dt;
      if (this.idle <= 0) {
        const a = FREE_AREA;
        this.walkTo({ x: a.minX + Math.random() * (a.maxX - a.minX), y: a.minY + Math.random() * (a.maxY - a.minY) });
      }
    }
  }

  startActivity(a: Activity): void {
    if (this.arrived && this.activity?.id === a.id) {
      this.activity = a;
      this.activeFor = a.duration;
      this.say(a.line);
      return;
    }
    this.path = [...this.exitPath(), a.approach, a.spot];
    this.activity = a;
  }

  walkTo(p: Vec2): void {
    const a = FREE_AREA;
    this.path = [...this.exitPath(), { x: clamp(p.x, a.minX, a.maxX), y: clamp(p.y, a.minY, a.maxY) }];
    this.activity = null;
  }

  poke(): void {
    if (this.pose === 'stand') this.hopT = HOP_TIME;
    this.say('♥');
  }

  say(text: string): void {
    this.onSay?.(text);
  }

  /** `world` is a world-pixel point; the hit box covers what was drawn last frame. */
  hitTest(world: Vec2): boolean {
    const b = this.hitBox;
    return !!b && world.x > b.x0 && world.x < b.x1 && world.y > b.y0 && world.y < b.y1;
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.pose === 'sleep') this.drawSleeping(ctx, time);
    else this.drawUpright(ctx, time);
  }

  private exitPath(): Vec2[] {
    return this.arrived && this.activity ? [this.activity.approach] : [];
  }

  private walk(dt: number): void {
    const target = this.path[0];
    const dx = target.x - this.pos.x;
    const dy = target.y - this.pos.y;
    const dist = Math.hypot(dx, dy);
    const step = SPEED * dt;
    if (dist > step) {
      this.pos.x += (dx / dist) * step;
      this.pos.y += (dy / dist) * step;
      this.walkClock += dt;
      const screenDx = dx - dy;
      if (Math.abs(screenDx) > 0.01) this.facing = screenDx > 0 ? 1 : -1;
      return;
    }

    this.pos = { ...target };
    this.path.shift();
    if (this.path.length) return;
    this.walkClock = 0;
    if (this.activity) {
      this.activeFor = this.activity.duration;
      this.facing = this.activity.facing;
      this.say(this.activity.line);
    } else {
      this.idle = 2 + Math.random() * 5;
    }
  }

  private spritePose(time: number): { pose: AvatarPose; frame: number } {
    if (this.path.length) return { pose: 'walk', frame: WALK_CYCLE[Math.floor(this.walkClock * WALK_FPS) % WALK_CYCLE.length] };
    const pose = this.pose;
    if (pose === 'wash') return { pose: 'wash', frame: Math.floor(time * 6) % 2 };
    if (pose === 'sit' && this.activity?.writing) return { pose: 'write', frame: Math.floor(time * 5) % 2 };
    if (pose === 'sit') return { pose: 'sit', frame: 0 };
    return { pose: 'stand', frame: 0 };
  }

  private drawUpright(ctx: CanvasRenderingContext2D, time: number): void {
    const f = projectPx(this.pos.x, this.pos.y);
    const hop = this.hopT > 0 ? Math.round(Math.sin((this.hopT / HOP_TIME) * Math.PI) * 8) : 0;
    const { pose, frame } = this.spritePose(time);
    const sprite = avatarFrame(pose, frame, this.facing, this.blinkIn < 0);

    ellipsePx(ctx, f.x, f.y, 11, 4, 'rgba(0, 0, 0, 0.22)');
    ctx.drawImage(sprite.canvas, f.x - sprite.ox, f.y - sprite.oy - hop);

    const top = f.y - hop + sprite.top;
    this.headTop = { x: f.x, y: top };
    this.hitBox = { x0: f.x - 13, x1: f.x + 13, y0: top, y1: f.y + 4 };
  }

  /** Lying on the lower bunk: head on the pillow, body under the blanket. */
  private drawSleeping(ctx: CanvasRenderingContext2D, time: number): void {
    const b = propOf('bunk');
    const chin = projectPx(b.x + b.w / 2, b.y + 0.34, MATTRESS_Z);
    const head = avatarFrame('head', 0, -1);
    ctx.drawImage(head.canvas, chin.x - head.ox, chin.y + 3 - head.oy);

    boxPx(ctx, b.x + 0.14, b.y + 0.58, MATTRESS_Z, b.w - 0.28, 1.05, 5, boxStyle(PAL.blanket));
    boxPx(ctx, b.x + 0.12, b.y + 1.1, MATTRESS_Z, b.w - 0.24, 0.6, 6, boxStyle(PAL.blanket));

    for (let i = 0; i < 3; i++) {
      const phase = (time * 0.45 + i / 3) % 1;
      drawZ(ctx, chin.x + 8 + Math.round(phase * 10), chin.y - 24 - Math.round(phase * 20), phase < 0.5 ? 1 : 2);
    }

    const top = chin.y + 3 + head.top;
    this.headTop = { x: chin.x, y: top };
    this.hitBox = { x0: chin.x - 12, x1: chin.x + 12, y0: top, y1: chin.y + 4 };
  }
}

/** Pixel "z", size 1 (4x4) or 2 (6x6), white with a dark drop shadow. */
function drawZ(ctx: CanvasRenderingContext2D, x: number, y: number, size: 1 | 2): void {
  const n = size === 1 ? 4 : 6;
  for (const [dx, color] of [
    [1, '#1c1a1a'],
    [0, '#ffffff'],
  ] as const) {
    ctx.fillStyle = color;
    ctx.fillRect(x + dx, y + dx, n, 1);
    ctx.fillRect(x + dx, y + dx + n - 1, n, 1);
    for (let i = 1; i < n - 1; i++) ctx.fillRect(x + dx + n - 1 - i, y + dx + i, 1, 1);
  }
}
