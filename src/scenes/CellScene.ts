import { feedLetters } from '../api';
import { PAL, TIME_ZONE } from '../config';
import type { Scene } from '../core/Scene';
import { linePx } from '../engine/draw';
import { PointerInput } from '../engine/Input';
import { boxHull, insideConvex, projectPx, unproject, type Vec2 } from '../engine/iso';
import { InmateActor } from '../game/InmateActor';
import { NpcActor } from '../game/NpcActor';
import { NPC_NAMES, type NpcId } from '../game/npcSprites';
import { FloorLetters } from '../game/FloorLetters';
import { InmateState, READ_MOOD_COST } from '../game/InmateState';
import type { Hud, NameTag } from '../ui/Hud';
import { activityFor, inCell, PROPS, type Activity } from '../world/cellMap';
import { renderCell, signAt, type RoomImage } from '../world/CellRenderer';

const TAP_MARK_TIME = 0.6;
/** Screen px two name tags need between them before the visitor's is lifted above Maduro's. */
const TAG_CLEARANCE = { x: 80, y: 22 };

const READ_LINES = ['…', 'Hmpf.', 'Bah.', '¿Otra más?'];

/** Chance, on each load, that one of these cellmates is in the cell. */
const VISITOR_CHANCE = 0.15;
const VISITORS: NpcId[] = ['diddy', 'luigi', 'pollo', 'cilia'];
/** Chávez haunts the cell from midnight to 00:30, New York time (minutes since midnight). */
const GHOST_HOURS = { from: 0, to: 30 };

const nycClock = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });

function nycMinutes(now: Date): number {
  const parts = nycClock.formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (get('hour') % 24) * 60 + get('minute');
}

interface Visitor {
  actor: NpcActor;
  tag: NameTag;
}

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
  private letters = new FloorLetters();
  private visitors: Visitor[] = [];
  /** `?visita=<id>` pins a visitor for testing; a pinned Chávez ignores the clock. */
  private pinned: NpcId | null = null;
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
    hud.onLetterSent((text) => {
      this.letters.add(text, 'Tú');
    });
    hud.setStats(this.state.stats);

    const pin = new URLSearchParams(location.search).get('visita') as NpcId | null;
    this.pinned = pin && pin in NPC_NAMES ? pin : null;
    if (this.pinned) this.addVisitor(this.pinned);
    else if (Math.random() < VISITOR_CHANCE) this.addVisitor(VISITORS[Math.floor(Math.random() * VISITORS.length)]);
    this.updateGhost(new Date());

    this.letters.refill = feedLetters;
    feedLetters()
      .then((remote) => this.letters.load(remote))
      .catch(() => this.letters.load([]));
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
    for (const v of this.visitors) v.actor.update(dt, this.actor.pos);
    for (const v of this.visitors.filter((v) => v.actor.gone)) v.tag.remove();
    this.visitors = this.visitors.filter((v) => !v.actor.gone);
    this.letters.update(dt);
    if (this.tapMark) {
      this.tapMark.ttl -= dt;
      if (this.tapMark.ttl <= 0) this.tapMark = null;
    }
    this.clockIn -= dt;
    if (this.clockIn <= 0) {
      this.clockIn = 1;
      const now = new Date();
      this.hud.updateClock(now);
      this.updateGhost(now);
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
    this.letters.draw(g, this.time);
    // Back to front, so whoever is nearer the viewer overlaps the other.
    const people: { depth: number; draw: () => void }[] = [
      { depth: this.actor.pos.x + this.actor.pos.y, draw: () => this.actor.draw(g, this.time) },
      ...this.visitors.map((v) => ({ depth: v.actor.pos.x + v.actor.pos.y, draw: () => v.actor.draw(g, this.time) })),
    ];
    people.sort((a, b) => a.depth - b.depth);
    for (const p of people) p.draw();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buffer, 0, 0, this.buffer.width * this.k, this.buffer.height * this.k);

    const head = this.worldToScreen(this.actor.headTop);
    this.hud.placeAvatar(head.x, head.y);
    for (const v of this.visitors) {
      const top = this.worldToScreen(v.actor.headTop);
      // Stack over Maduro's tag instead of hiding behind it when they stand together.
      const crowded = Math.abs(top.x - head.x) < TAG_CLEARANCE.x && Math.abs(top.y - head.y) < TAG_CLEARANCE.y;
      v.tag.place(top.x, crowded ? Math.min(top.y, head.y) - TAG_CLEARANCE.y : top.y, v.actor.opacity);
    }
  }

  private addVisitor(id: NpcId): void {
    const ghost = id === 'chavez';
    const actor = new NpcActor(id, ghost, this.actor.pos, id === 'diddy');
    this.visitors.push({ actor, tag: this.hud.addNameTag(NPC_NAMES[id], ghost) });
  }

  /** Brings the ghost in at midnight and lets him fade away at half past. */
  private updateGhost(now: Date): void {
    const minutes = nycMinutes(now);
    const due = this.pinned === 'chavez' || (minutes >= GHOST_HOURS.from && minutes < GHOST_HOURS.to);
    const ghost = this.visitors.find((v) => v.actor.ghost && !v.actor.gone);
    if (due && !ghost) this.addVisitor('chavez');
    else if (!due && ghost) ghost.actor.leave();
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
    return this.actor.hitTest(world) || this.visitors.some((v) => v.actor.hitTest(world)) || signAt(world) !== null || this.letters.at(world) !== null || this.activityAt(world) !== null;
  }

  private tap(sx: number, sy: number): void {
    const world = this.screenToWorld(sx, sy);
    if (this.actor.hitTest(world)) {
      this.actor.poke();
      this.state.apply('poke');
      this.hud.setStats(this.state.stats);
      return;
    }
    const visitor = this.visitors.find((v) => v.actor.hitTest(world));
    if (visitor) {
      visitor.actor.hop();
      return;
    }
    const sign = signAt(world);
    if (sign === 'info') {
      this.hud.openInfo();
      return;
    }
    if (sign === 'ranking') {
      this.hud.openRanking();
      return;
    }
    const letter = this.letters.at(world);
    if (letter) {
      this.letters.take(letter);
      this.state.apply('read');
      this.hud.setStats(this.state.stats);
      this.hud.openLetter(letter, READ_MOOD_COST);
      this.actor.say(READ_LINES[Math.floor(Math.random() * READ_LINES.length)]);
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
