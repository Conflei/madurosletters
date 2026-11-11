import { INMATE_NAME, PAL } from '../config';
import { boxColors, isoBox } from '../engine/draw';
import { project, type Vec2 } from '../engine/iso';
import { FREE_AREA, INMATE_SPOT, propOf, SEAT_Z, type Activity, type Pose } from '../world/cellMap';

const SPEED = 0.9;
const HOP_TIME = 0.45;
const BUBBLE_TIME = 2.2;
const NAME_SIGN_H = 14;
/** Screen y of the torso's bottom edge, relative to the feet. */
const STAND_BASE = -16;
const SIT_BASE = -(SEAT_Z + 1);
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
  private path: Vec2[] = [];
  private activity: Activity | null = null;
  private activeFor = 0;
  private idle = 2.5;
  private facing: 1 | -1 = -1;
  private stride = 0;
  private hopT = 0;
  private blinkIn = 3;
  private bubble: { text: string; ttl: number } | null = null;
  private hitBox: Box | null = null;

  private get arrived(): boolean {
    return this.activity !== null && this.path.length === 0;
  }

  get pose(): Pose {
    return this.arrived && this.activity ? this.activity.pose : 'stand';
  }

  update(dt: number): void {
    this.hopT = Math.max(0, this.hopT - dt);
    if (this.bubble) {
      this.bubble.ttl -= dt;
      if (this.bubble.ttl <= 0) this.bubble = null;
    }
    this.blinkIn -= dt;
    if (this.blinkIn < -0.12) this.blinkIn = 2 + Math.random() * 4;

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
    this.bubble = { text, ttl: BUBBLE_TIME };
  }

  /** `world` is a world-pixel point; the hit box covers what was drawn last frame. */
  hitTest(world: Vec2): boolean {
    const b = this.hitBox;
    return !!b && world.x > b.x0 && world.x < b.x1 && world.y > b.y0 && world.y < b.y1;
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const pose = this.pose;
    const top = pose === 'sleep' ? this.drawSleeping(ctx, time) : this.drawUpright(ctx, time, pose);
    const signY = top.y - 6;
    this.drawNameSign(ctx, top.x, signY);
    if (this.bubble) this.drawBubble(ctx, top.x, signY - NAME_SIGN_H - 4, this.bubble.text, Math.min(1, this.bubble.ttl * 3));
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
      this.stride += dt * 9;
      const screenDx = dx - dy;
      if (Math.abs(screenDx) > 0.01) this.facing = screenDx > 0 ? 1 : -1;
      return;
    }

    this.pos = { ...target };
    this.path.shift();
    if (this.path.length) return;
    this.stride = 0;
    if (this.activity) {
      this.activeFor = this.activity.duration;
      this.facing = this.activity.facing;
      this.say(this.activity.line);
    } else {
      this.idle = 2 + Math.random() * 5;
    }
  }

  /** Returns the world point at the top of the head. */
  private drawUpright(ctx: CanvasRenderingContext2D, time: number, pose: Pose): Vec2 {
    const f = project(this.pos.x, this.pos.y);
    const walking = this.path.length > 0;
    const sitting = pose === 'sit';
    const base = sitting ? SIT_BASE : STAND_BASE;
    const hop = this.hopT > 0 ? Math.sin((this.hopT / HOP_TIME) * Math.PI) * 10 : 0;
    const breathe = walking ? Math.abs(Math.sin(this.stride)) * 1.5 : Math.sin(time * 2.2) * 0.7;
    const lift = walking ? Math.sin(this.stride) * 2.5 : 0;

    let leftArm = walking ? Math.sin(this.stride) * 2 : 0;
    let rightArm = -leftArm;
    if (pose === 'wash') {
      leftArm = -4 + Math.sin(time * 14) * 2;
      rightArm = -4 - Math.sin(time * 14) * 2;
    } else if (sitting && this.activity?.writing) {
      rightArm = -3 + Math.sin(time * 11);
    }

    ctx.save();
    ctx.translate(f.x, f.y);

    ctx.fillStyle = `rgba(0, 0, 0, ${0.3 - hop * 0.012})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12 - hop * 0.3, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(0, -hop);
    if (sitting) {
      // Thighs point at the viewer, so only the knees and shins show.
      ctx.fillStyle = PAL.jumpsuitDark;
      ctx.fillRect(-7, base - 1, 14, 5);
      for (const x of [-6, 1]) {
        ctx.fillStyle = PAL.jumpsuitDark;
        ctx.fillRect(x, base + 4, 5, -base - 3);
        ctx.fillStyle = PAL.shoe;
        ctx.fillRect(x - 0.5, -2, 6, 3);
      }
    } else {
      const leg = (x: number, l: number) => {
        ctx.fillStyle = PAL.jumpsuitDark;
        ctx.fillRect(x, base - 2 - l, 5, 16);
        ctx.fillStyle = PAL.shoe;
        ctx.fillRect(x - 0.5, -3 - l, 6, 3);
      };
      leg(-6, Math.max(0, lift));
      leg(1, Math.max(0, -lift));
    }

    ctx.translate(0, -breathe);
    const arm = (x: number, s: number) => {
      ctx.fillStyle = PAL.jumpsuitDark;
      ctx.fillRect(x, base - 22 + s, 4, 15);
      ctx.fillStyle = PAL.skin;
      ctx.fillRect(x, base - 8 + s, 4, 4);
    };
    arm(-12.5, leftArm);
    arm(8.5, rightArm);

    ctx.fillStyle = PAL.jumpsuit;
    ctx.beginPath();
    ctx.roundRect(-9, base - 24, 18, 24, 4);
    ctx.fill();
    ctx.fillStyle = PAL.jumpsuitDark;
    ctx.fillRect(-0.5, base - 20, 1, 18);
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(2.5, base - 19, 5, 3);

    this.drawHead(ctx, base - 25, false);
    ctx.restore();

    const top = { x: f.x, y: f.y - hop - breathe + base - 46 };
    this.hitBox = { x0: f.x - 14, x1: f.x + 14, y0: top.y, y1: f.y + 4 };
    return top;
  }

  /** Lying on the lower bunk: head on the pillow, body under the blanket. */
  private drawSleeping(ctx: CanvasRenderingContext2D, time: number): Vec2 {
    const b = propOf('bunk');
    const head = project(b.x + b.w / 2, b.y + 0.32, MATTRESS_Z);
    const neckY = head.y + 4;

    ctx.save();
    ctx.translate(head.x, neckY);
    this.drawHead(ctx, 0, true);
    ctx.restore();

    isoBox(ctx, b.x + 0.14, b.y + 0.5, MATTRESS_Z, b.w - 0.28, 1.15, 6, boxColors(PAL.jumpsuit));
    isoBox(ctx, b.x + 0.1, b.y + 1.05, MATTRESS_Z, b.w - 0.2, 0.65, 7.5, boxColors(PAL.blanket));

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const phase = (time * 0.5 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(phase * Math.PI);
      ctx.font = `bold ${7 + phase * 4}px system-ui, sans-serif`;
      ctx.fillText('z', head.x + 10 + phase * 10, neckY - 20 - phase * 18);
    }
    ctx.restore();

    const top = { x: head.x, y: neckY - 21 };
    this.hitBox = { x0: head.x - 12, x1: head.x + 12, y0: top.y, y1: neckY + 4 };
    return top;
  }

  /** Head drawn upward from the neck line at local y = `neckY`. */
  private drawHead(ctx: CanvasRenderingContext2D, neckY: number, asleep: boolean): void {
    ctx.fillStyle = PAL.skin;
    ctx.beginPath();
    ctx.roundRect(-9, neckY - 19, 18, 19, 6);
    ctx.fill();
    ctx.fillStyle = PAL.hair;
    ctx.beginPath();
    ctx.roundRect(-9.5, neckY - 21, 19, 7, 4);
    ctx.fill();
    ctx.fillRect(this.facing > 0 ? -9.5 : 6.5, neckY - 17, 3, 6);

    const cx = asleep ? 0 : this.facing * 1.5;
    const closed = asleep || this.blinkIn < 0;
    ctx.fillStyle = '#1d1d22';
    for (const x of [-4.5, 2.5]) ctx.fillRect(x + cx, closed ? neckY - 9.5 : neckY - 10, 2, closed ? 0.8 : 2.5);

    // Scowling brows, slanting down toward the nose.
    ctx.strokeStyle = PAL.hair;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - 6.5, neckY - 14);
    ctx.lineTo(cx - 1.8, neckY - 12);
    ctx.moveTo(cx + 1.8, neckY - 12);
    ctx.lineTo(cx + 6.5, neckY - 14);
    ctx.stroke();

    // Bushy mustache, anchored just under the nose: a solid band with drooping tips.
    ctx.save();
    ctx.translate(cx, neckY - 5.5);
    ctx.fillStyle = PAL.hair;
    ctx.beginPath();
    ctx.moveTo(-5.5, 3.2);
    ctx.quadraticCurveTo(-5.8, -1.6, -1, -1.4);
    ctx.quadraticCurveTo(0, -0.8, 1, -1.4);
    ctx.quadraticCurveTo(5.8, -1.6, 5.5, 3.2);
    ctx.quadraticCurveTo(3, 2.6, 0, 2.9);
    ctx.quadraticCurveTo(-3, 2.6, -5.5, 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Habbo-style name plate floating above the head; `y` is its bottom edge. */
  private drawNameSign(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.font = 'bold 9px system-ui, sans-serif';
    const w = ctx.measureText(INMATE_NAME).width + 14;
    ctx.fillStyle = PAL.sign;
    ctx.strokeStyle = PAL.signText;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - NAME_SIGN_H, w, NAME_SIGN_H, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(INMATE_NAME, x, y - NAME_SIGN_H / 2 + 0.5);
    ctx.restore();
  }

  private drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, alpha: number): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 10px system-ui, sans-serif';
    const w = Math.max(20, ctx.measureText(text).width + 12);
    const h = 17;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h, w, h, 6);
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x, y + 5);
    ctx.lineTo(x + 4, y);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = text === '♥' ? '#e5484d' : '#1d2a3a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - h / 2 + 0.5);
    ctx.restore();
  }
}
