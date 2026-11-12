import { ellipsePx } from '../engine/draw';
import { projectPx, type Vec2 } from '../engine/iso';
import { FREE_AREA } from '../world/cellMap';
import { npcFrame, type NpcId } from './npcSprites';

const SPEED = 0.7;
const GHOST_SPEED = 0.35;
const WALK_FPS = 8;
const WALK_CYCLE = [1, 0, 2, 0];
const HOP_TIME = 0.4;
const FADE_TIME = 1.2;
/** Tiles to keep between a visitor's destination and the inmate. */
const PERSONAL_SPACE = 0.9;
/** A follower keeps this close to the inmate, from an angle that shifts every few seconds. */
const FOLLOW_DISTANCE = 0.6;
const FOLLOW_SLACK = 0.25;
const FOLLOW_SPEED = 1.0;
const FOLLOW_REANGLE: [number, number] = [3, 6];

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const clampToFloor = (p: Vec2): Vec2 => {
  const a = FREE_AREA;
  return { x: Math.max(a.minX, Math.min(a.maxX, p.x)), y: Math.max(a.minY, Math.min(a.maxY, p.y)) };
};

const randomSpot = (): Vec2 => {
  const a = FREE_AREA;
  return { x: a.minX + Math.random() * (a.maxX - a.minX), y: a.minY + Math.random() * (a.maxY - a.minY) };
};

/** A cellmate who just strolls around the cell. Ghosts float, glow and fade in and out. */
export class NpcActor {
  pos: Vec2;
  /** World pixel just above the top of the head, for the name tag. */
  headTop: Vec2 = { x: 0, y: 0 };
  /** 0..1, ramps up on arrival and down on `leave()`. */
  opacity = 0;

  private target: Vec2 | null = null;
  private idle = 1 + Math.random() * 2;
  private facing: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  private walkClock = 0;
  private hopT = 0;
  private blinkIn = 2 + Math.random() * 3;
  private leaving = false;
  private hitBox: Box | null = null;
  private followAngle = Math.random() * Math.PI * 2;
  private reangleIn = 0;

  /** `follows`: sticks close to the inmate instead of wandering. */
  constructor(
    readonly id: NpcId,
    readonly ghost: boolean,
    avoid: Vec2,
    readonly follows = false,
  ) {
    this.pos = this.spotAwayFrom(avoid);
  }

  /** Faded out completely after `leave()`; safe to drop. */
  get gone(): boolean {
    return this.leaving && this.opacity <= 0;
  }

  leave(): void {
    this.leaving = true;
  }

  hop(): void {
    this.hopT = HOP_TIME;
  }

  hitTest(world: Vec2): boolean {
    const b = this.hitBox;
    return this.opacity > 0.5 && !!b && world.x > b.x0 && world.x < b.x1 && world.y > b.y0 && world.y < b.y1;
  }

  /** `inmate` is where Maduro stands, so visitors don't pick his spot to stop on. */
  update(dt: number, inmate: Vec2): void {
    this.opacity = Math.max(0, Math.min(1, this.opacity + (this.leaving ? -dt : dt) / FADE_TIME));
    this.hopT = Math.max(0, this.hopT - dt);
    this.blinkIn -= dt;
    if (this.blinkIn < -0.15) this.blinkIn = 2 + Math.random() * 4;

    if (this.follows) {
      this.follow(dt, inmate);
      return;
    }
    if (!this.target) {
      this.idle -= dt;
      if (this.idle <= 0) this.target = this.spotAwayFrom(inmate);
      return;
    }
    const dx = this.target.x - this.pos.x;
    const dy = this.target.y - this.pos.y;
    const dist = Math.hypot(dx, dy);
    const step = (this.ghost ? GHOST_SPEED : SPEED) * dt;
    if (dist > step) {
      this.pos.x += (dx / dist) * step;
      this.pos.y += (dy / dist) * step;
      this.walkClock += dt;
      const screenDx = dx - dy;
      if (Math.abs(screenDx) > 0.01) this.facing = screenDx > 0 ? 1 : -1;
      return;
    }
    this.pos = { ...this.target };
    this.target = null;
    this.walkClock = 0;
    this.idle = 2 + Math.random() * 5;
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.opacity <= 0) return;
    const f = projectPx(this.pos.x, this.pos.y);
    const hop = this.hopT > 0 ? Math.round(Math.sin((this.hopT / HOP_TIME) * Math.PI) * 8) : 0;
    const float = this.ghost ? 6 + Math.round(Math.sin(time * 2) * 2) : 0;
    const walking = this.target !== null && !this.ghost;
    const step = walking ? WALK_CYCLE[Math.floor(this.walkClock * WALK_FPS) % WALK_CYCLE.length] : 0;
    const sprite = npcFrame(this.id, step, this.facing, this.blinkIn < 0, this.ghost);
    const lift = hop + float;

    ctx.save();
    ctx.globalAlpha = this.opacity * (this.ghost ? 0.85 : 1);
    if (this.ghost) ellipsePx(ctx, f.x, f.y, 12, 4, 'rgba(170, 220, 255, 0.18)');
    else ellipsePx(ctx, f.x, f.y, 10, 4, 'rgba(0, 0, 0, 0.22)');
    ctx.drawImage(sprite.canvas, f.x - sprite.ox, f.y - sprite.oy - lift);
    ctx.restore();

    const top = f.y - lift + sprite.top;
    this.headTop = { x: f.x, y: top };
    this.hitBox = { x0: f.x - 11, x1: f.x + 11, y0: top, y1: f.y + 4 - lift };
  }

  /** Trails the inmate: heads for a spot just beside him and turns to face him when there. */
  private follow(dt: number, inmate: Vec2): void {
    this.reangleIn -= dt;
    if (this.reangleIn <= 0) {
      this.reangleIn = FOLLOW_REANGLE[0] + Math.random() * (FOLLOW_REANGLE[1] - FOLLOW_REANGLE[0]);
      this.followAngle += (Math.random() - 0.5) * Math.PI;
    }
    const spot = clampToFloor({
      x: inmate.x + Math.cos(this.followAngle) * FOLLOW_DISTANCE,
      y: inmate.y + Math.sin(this.followAngle) * FOLLOW_DISTANCE,
    });
    const dx = spot.x - this.pos.x;
    const dy = spot.y - this.pos.y;
    const dist = Math.hypot(dx, dy);
    const busy = this.target !== null;
    if (dist > (busy ? 0.05 : FOLLOW_SLACK)) {
      const step = Math.min(dist, FOLLOW_SPEED * dt);
      this.pos.x += (dx / dist) * step;
      this.pos.y += (dy / dist) * step;
      this.walkClock += dt;
      this.target = spot;
      const screenDx = dx - dy;
      if (Math.abs(screenDx) > 0.01) this.facing = screenDx > 0 ? 1 : -1;
      return;
    }
    this.target = null;
    this.walkClock = 0;
    const toInmate = inmate.x - this.pos.x - (inmate.y - this.pos.y);
    if (Math.abs(toInmate) > 0.05) this.facing = toInmate > 0 ? 1 : -1;
  }

  private spotAwayFrom(p: Vec2): Vec2 {
    let spot = randomSpot();
    for (let tries = 0; tries < 10 && Math.hypot(spot.x - p.x, spot.y - p.y) < PERSONAL_SPACE; tries++) spot = randomSpot();
    return spot;
  }
}
