import { PAL, WALL_H } from '../config';
import type { Scene, View } from '../core/Scene';
import { Camera } from '../engine/Camera';
import { withPlaneX, withPlaneY } from '../engine/draw';
import { PointerInput } from '../engine/Input';
import { boxHull, insideConvex, project, unproject, type Vec2 } from '../engine/iso';
import { InmateActor } from '../game/InmateActor';
import { InmateState } from '../game/InmateState';
import type { Hud } from '../ui/Hud';
import { activityFor, inCell, PROPS, type Activity } from '../world/cellMap';
import { LAMP_V, LAMPS, renderCell, type Lamp, type RoomImage } from '../world/CellRenderer';

const TAP_MARK_TIME = 0.5;

const WRITE: Activity = { ...(activityFor('stool') as Activity), writing: true, duration: 8, line: '✉ Dear…' };

export class CellScene implements Scene {
  private camera = new Camera();
  private room: RoomImage;
  private state = new InmateState();
  private actor = new InmateActor();
  private tapMark: { pos: Vec2; ttl: number } | null = null;
  private time = 0;
  private clockIn = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private hud: Hud,
  ) {
    const scale = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1)));
    this.room = renderCell(scale);

    new PointerInput(canvas, { onTap: (x, y) => this.tap(x, y) });
    hud.onAction((action) => {
      this.state.apply(action);
      this.actor.startActivity(WRITE);
      this.hud.setStats(this.state.stats);
    });
    hud.setStats(this.state.stats);
  }

  resize(width: number, height: number): void {
    this.camera.setViewport(width, height);
    this.camera.fit(this.room.bounds, this.hud.stageRect());
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

  render(ctx: CanvasRenderingContext2D, { width, height, dpr }: View): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, PAL.bgTop);
    bg.addColorStop(1, PAL.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    this.camera.apply(ctx, dpr);
    const b = this.room.bounds;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.room.image, b.x, b.y, b.w, b.h);
    this.drawLamps(ctx);
    if (this.tapMark) this.drawTapMark(ctx, this.tapMark.pos, this.tapMark.ttl / TAP_MARK_TIME);
    this.actor.draw(ctx, this.time);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.75);
    v.addColorStop(0, 'rgba(0, 0, 0, 0)');
    v.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, width, height);
  }

  private tap(sx: number, sy: number): void {
    const world = this.camera.screenToWorld(sx, sy);
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
      this.tapMark = { pos: tile, ttl: TAP_MARK_TIME };
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

  private lampIntensity(lamp: Lamp): number {
    if (!lamp.flicker) return 1;
    const burst = Math.sin(this.time * 0.9) > 0.9;
    return burst && Math.sin(this.time * 63) * Math.sin(this.time * 17) > 0 ? 0.2 : 1;
  }

  private drawLamps(ctx: CanvasRenderingContext2D): void {
    for (const lamp of LAMPS) {
      const k = this.lampIntensity(lamp);
      const p = project(lamp.x, lamp.y, lamp.z);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x, p.y + 4, 0, p.x, p.y + 4, 64);
      g.addColorStop(0, `rgba(255, 214, 150, ${0.32 * k})`);
      g.addColorStop(0.3, `rgba(255, 190, 120, ${0.1 * k})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - 64, p.y - 60, 128, 128);
      ctx.restore();

      if (k < 1) {
        const dim = () => {
          ctx.fillStyle = 'rgba(40, 40, 44, 0.8)';
          ctx.fillRect(-7, LAMP_V + 5, 14, 3);
        };
        if (lamp.x === 0) withPlaneX(ctx, 0, lamp.y, WALL_H, dim);
        else withPlaneY(ctx, lamp.x, lamp.y, WALL_H, dim);
      }
    }
  }

  private drawTapMark(ctx: CanvasRenderingContext2D, tile: Vec2, life: number): void {
    const p = project(tile.x, tile.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, 6 + (1 - life) * 10, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${life * 0.8})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}
