import { PAL } from '../config';
import type { Scene } from '../core/Scene';
import { linePx } from '../engine/draw';
import { PointerInput } from '../engine/Input';
import { boxHull, insideConvex, projectPx, unproject, type Vec2 } from '../engine/iso';
import { InmateActor } from '../game/InmateActor';
import { InmateState } from '../game/InmateState';
import type { Hud } from '../ui/Hud';
import { activityFor, inCell, PROPS, type Activity } from '../world/cellMap';
import { renderCell, type RoomImage } from '../world/CellRenderer';

const TAP_MARK_TIME = 0.6;

const WRITE: Activity = { ...(activityFor('stool') as Activity), writing: true, duration: 8, line: 'Dear…' };

/**
 * The cell is drawn 1:1 in art pixels into a small buffer, which is then blown up by a whole
 * number onto the screen canvas with smoothing off, so every art pixel stays a crisp square.
 */
export class CellScene implements Scene {
  private room: RoomImage;
  private buffer = document.createElement('canvas');
  private bctx: CanvasRenderingContext2D;
  private state = new InmateState();
  private actor = new InmateActor();
  /** Integer art-pixel upscale and the world -> buffer offset. */
  private k = 1;
  private dpr = 1;
  private off: Vec2 = { x: 0, y: 0 };
  private hover: { x: number; y: number } | null = null;
  private tapMark: { tile: { x: number; y: number }; ttl: number } | null = null;
  private time = 0;
  private clockIn = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private hud: Hud,
  ) {
    this.room = renderCell();
    const bctx = this.buffer.getContext('2d', { alpha: false });
    if (!bctx) throw new Error('Unable to create scene buffer');
    this.bctx = bctx;

    new PointerInput(canvas, {
      onTap: (x, y) => this.tap(x, y),
      onHover: (x, y) => {
        const tile = x === null || y === null ? null : this.tileAt(this.screenToWorld(x, y));
        this.hover = tile;
        canvas.style.cursor = tile || (x !== null && y !== null && this.interactiveAt(this.screenToWorld(x, y))) ? 'pointer' : 'default';
      },
    });

    this.actor.onSay = (text) => hud.say(text);
    hud.onAction((action) => {
      this.state.apply(action);
      this.actor.startActivity(WRITE);
      this.hud.setStats(this.state.stats);
    });
    hud.onChat((text) => this.actor.say(text));
    hud.setStats(this.state.stats);
  }

  resize(width: number, height: number, dpr: number): void {
    this.dpr = dpr;
    const stage = this.hud.stageRect();
    const b = this.room.bounds;
    this.k = Math.max(1, Math.floor(Math.min((stage.w * dpr) / b.w, (stage.h * dpr) / b.h)));

    this.buffer.width = Math.ceil((width * dpr) / this.k);
    this.buffer.height = Math.ceil((height * dpr) / this.k);
    const cx = ((stage.x + stage.w / 2) * dpr) / this.k;
    const cy = ((stage.y + stage.h / 2) * dpr) / this.k;
    this.off = { x: Math.round(cx - (b.x + b.w / 2)), y: Math.round(cy - (b.y + b.h / 2)) };
  }

  update(dt: number): void {
    this.time += dt;
    this.state.tick(dt / 60);
    this.actor.update(dt);
    if (this.tapMark) {
      this.tapMark.ttl -= dt;
      if (this.tapMark.ttl <= 0) this.tapMark = null;
    }
    this.clockIn -= dt;
    if (this.clockIn <= 0) {
      this.clockIn = 1;
      this.hud.updateClock(new Date());
    }
    this.hud.setStats(this.state.stats);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const g = this.bctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = PAL.void;
    g.fillRect(0, 0, this.buffer.width, this.buffer.height);

    g.setTransform(1, 0, 0, 1, this.off.x, this.off.y);
    const b = this.room.bounds;
    g.drawImage(this.room.image, b.x, b.y);
    const cursor = this.tapMark?.tile ?? this.hover;
    if (cursor) drawTileCursor(g, cursor.x, cursor.y);
    this.actor.draw(g, this.time);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buffer, 0, 0, this.buffer.width * this.k, this.buffer.height * this.k);

    const head = this.worldToScreen(this.actor.headTop);
    this.hud.placeAvatar(head.x, head.y);
  }

  private screenToWorld(sx: number, sy: number): Vec2 {
    return { x: (sx * this.dpr) / this.k - this.off.x, y: (sy * this.dpr) / this.k - this.off.y };
  }

  private worldToScreen(p: Vec2): Vec2 {
    return { x: ((p.x + this.off.x) * this.k) / this.dpr, y: ((p.y + this.off.y) * this.k) / this.dpr };
  }

  private tileAt(world: Vec2): { x: number; y: number } | null {
    const t = unproject(world.x, world.y);
    return inCell(t.x, t.y) ? { x: Math.floor(t.x), y: Math.floor(t.y) } : null;
  }

  private interactiveAt(world: Vec2): boolean {
    return this.actor.hitTest(world) || this.activityAt(world) !== null;
  }

  private tap(sx: number, sy: number): void {
    const world = this.screenToWorld(sx, sy);
    this.hud.dismissTip();
    if (this.actor.hitTest(world)) {
      this.actor.poke();
      return;
    }
    const activity = this.activityAt(world);
    if (activity) {
      this.actor.startActivity(activity);
      return;
    }
    const tile = unproject(world.x, world.y);
    if (inCell(tile.x, tile.y)) {
      this.actor.walkTo(tile);
      this.tapMark = { tile: { x: Math.floor(tile.x), y: Math.floor(tile.y) }, ttl: TAP_MARK_TIME };
    }
  }

  /** Front-most interactive prop under the world point, if any. */
  private activityAt(world: Vec2): Activity | null {
    let best: Activity | null = null;
    let bestDepth = -Infinity;
    for (const p of PROPS) {
      const activity = activityFor(p.kind);
      if (!activity || !insideConvex(boxHull(p.x, p.y, p.w, p.d, p.h), world)) continue;
      const depth = p.x + p.w + p.y + p.d;
      if (depth > bestDepth) {
        best = activity;
        bestDepth = depth;
      }
    }
    return best;
  }
}

/** Habbo's tile selector: a thick white diamond outline with a dark rim underneath. */
function drawTileCursor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const ring = (dy: number, inset: number, color: string) => {
    const pts = [projectPx(x + inset, y + inset), projectPx(x + 1 - inset, y + inset), projectPx(x + 1 - inset, y + 1 - inset), projectPx(x + inset, y + 1 - inset)];
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      linePx(ctx, { x: a.x, y: a.y + dy }, { x: b.x, y: b.y + dy }, color);
    }
  };
  ring(1, 0.04, 'rgba(0, 0, 0, 0.45)');
  ring(0, 0.04, '#ffffff');
  ring(-1, 0.04, '#ffffff');
  ring(0, 0.1, 'rgba(255, 255, 255, 0.55)');
}
