import { BAR_H, FLOOR_T, HALF_W, PAINT_H, PAL, WALL_H, WALL_T } from '../config';
import { boxPx, boxStyle, ellipsePx, fillPoly, linePx, planeRect, shade, tileDiamond, type BoxStyle, type Plane } from '../engine/draw';
import { projectPx, type Bounds, type Vec2 } from '../engine/iso';
import type { Sky } from '../game/nycTime';
import { CELL_D, CELL_W, CORRIDOR_D, CORRIDOR_W, DOOR_X, PROPS, SEAT_Z, type Prop, type PropKind } from './cellMap';

export interface RoomImage {
  image: HTMLCanvasElement;
  bounds: Bounds;
}

/** y of the corridor's far wall. */
const BACK = -CORRIDOR_D;
/** Screen-x pixels of side wall per tile, measured from its front end. */
const sideU = (y: number) => (CELL_D - y) * HALF_W;

export function cellBounds(): Bounds {
  const pts = [
    projectPx(-WALL_T, BACK - WALL_T, WALL_H),
    projectPx(CORRIDOR_W, BACK - WALL_T, WALL_H),
    projectPx(-WALL_T, CELL_D, -FLOOR_T),
    projectPx(CORRIDOR_W, BACK - WALL_T, -FLOOR_T),
    projectPx(CORRIDOR_W, 0, -FLOOR_T),
    projectPx(CELL_W, CELL_D, -FLOOR_T),
  ];
  const pad = 2;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

/** Paints the static cell at 1 art pixel per canvas pixel; repainted only when the sky changes. */
export function renderCell(sky: Sky): RoomImage {
  const bounds = cellBounds();
  const image = document.createElement('canvas');
  image.width = bounds.w;
  image.height = bounds.h;
  const ctx = image.getContext('2d');
  if (!ctx) throw new Error('Unable to create offscreen canvas');
  ctx.setTransform(1, 0, 0, 1, -bounds.x, -bounds.y);

  // Walls extend below the floor line for their end caps, so the floor must cover them afterwards.
  drawWallBoxes(ctx);
  drawFloor(ctx);
  drawWallFaces(ctx, sky);
  drawShadows(ctx);
  for (const d of depthSort(buildDrawables())) d.draw(ctx);

  return { image, bounds };
}

// ---------------------------------------------------------------------------
// Floor & walls

function drawFloor(ctx: CanvasRenderingContext2D): void {
  const slab = { top: PAL.floor, left: PAL.floorLeft, right: PAL.floorRight };
  boxPx(ctx, 0, BACK, -FLOOR_T, CELL_W, CELL_D - BACK, FLOOR_T, slab);
  boxPx(ctx, CELL_W, BACK, -FLOOR_T, CORRIDOR_W - CELL_W, -BACK, FLOOR_T, slab);

  const rowW = (y: number) => (y < 0 ? CORRIDOR_W : CELL_W);
  for (let y = BACK; y < CELL_D; y++) {
    for (let x = 0; x < rowW(y); x++) {
      fillPoly(ctx, tileDiamond(x, y), y < 0 ? PAL.corridorFloor : PAL.floor);
    }
  }
  for (let y = BACK; y < CELL_D; y++) {
    for (let x = 0; x < rowW(y); x++) {
      const grid = y < 0 ? PAL.corridorGrid : PAL.floorGrid;
      linePx(ctx, projectPx(x, y), projectPx(x + 1, y), grid);
      linePx(ctx, projectPx(x, y), projectPx(x, y + 1), grid);
    }
  }

  const drain = projectPx(1.8, 4.1);
  ellipsePx(ctx, drain.x, drain.y, 7, 4, '#5b5b54');
  ellipsePx(ctx, drain.x, drain.y, 5, 3, '#3c3c37');
  ctx.fillStyle = '#5b5b54';
  for (let i = -3; i <= 3; i += 2) ctx.fillRect(drain.x + i, drain.y - 2, 1, 4);
}

function drawWallBoxes(ctx: CanvasRenderingContext2D): void {
  const t = WALL_T;
  const h = WALL_H + FLOOR_T;
  const cap = { top: PAL.wallCap, left: PAL.wallEnd, right: PAL.wallEnd };
  // Side wall first so the corridor wall caps the shared corner.
  boxPx(ctx, -t, BACK - t, -FLOOR_T, t, CELL_D - BACK + t, h, cap);
  boxPx(ctx, 0, BACK - t, -FLOOR_T, CORRIDOR_W, t, h, cap);
}

interface WallColors {
  block: string;
  mortar: string;
  paint: string;
  paintMortar: string;
  trim: string;
  base: string;
}

/** Habbo lights the left wall more than the right; the corridor is darker still. */
const wallColors = (dark: number): WallColors => ({
  block: shade(PAL.wallBlock, dark),
  mortar: shade(PAL.wallBlock, dark - 0.09),
  paint: shade(PAL.wallPaint, dark),
  paintMortar: shade(PAL.wallPaint, dark - 0.12),
  trim: shade(PAL.wallTrim, dark),
  base: shade(PAL.wallBase, dark),
});

function drawWallFaces(ctx: CanvasRenderingContext2D, sky: Sky): void {
  const side: Plane = { ...projectPx(0, CELL_D, WALL_H), slope: -1 };
  const back = backPlane();

  paintWall(ctx, side, 0, sideU(0), wallColors(0));
  paintWall(ctx, side, sideU(0), sideU(BACK), wallColors(-0.34));
  paintWall(ctx, back, 0, CORRIDOR_W * HALF_W, wallColors(-0.42));

  drawWallLamp(ctx, back, (CELL_W * HALF_W) / 2, true);
  drawInfoSign(ctx, back, SIGNS[0]);
  drawRankingSign(ctx, back, SIGNS[1]);

  drawWindow(ctx, side, sideU(1.1) - 14, 18, sky);
  drawWallLamp(ctx, side, sideU(2.75), false);
  drawPhotos(ctx, side, sideU(2.75), 36);
  drawTally(ctx, side, sideU(3.95), 46);
  drawMirror(ctx, side, sideU(4.52), 40);
}

// ---------------------------------------------------------------------------
// Corridor notice boards (tappable)

export type SignId = 'info' | 'ranking';

interface Sign {
  id: SignId;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** Boards on the corridor's back wall, past the pillar where the bars don't cover them. */
const SIGNS: Sign[] = [
  { id: 'info', u0: 72, u1: 100, v0: 38, v1: 62 },
  { id: 'ranking', u0: 104, u1: 124, v0: 44, v1: 64 },
];

const backPlane = (): Plane => ({ ...projectPx(0, BACK, WALL_H), slope: 1 });

/** Which notice board, if any, is under a world-pixel point. */
export function signAt(world: Vec2): SignId | null {
  const pl = backPlane();
  const u = Math.floor(world.x - pl.x);
  const v = world.y - pl.y - Math.floor(u / 2);
  const pad = 3;
  const hit = SIGNS.find((s) => u >= s.u0 - pad && u < s.u1 + pad && v >= s.v0 - pad && v < s.v1 + pad);
  return hit ? hit.id : null;
}

function signBoard(ctx: CanvasRenderingContext2D, pl: Plane, s: Sign, face: string): void {
  planeRect(ctx, pl, s.u0 + 1, s.u1 + 1, s.v0 + 1, s.v1 + 1, 'rgba(0, 0, 0, 0.3)');
  planeRect(ctx, pl, s.u0, s.u1, s.v0, s.v1, '#22262c');
  planeRect(ctx, pl, s.u0 + 1, s.u1 - 1, s.v0 + 1, s.v1 - 1, face);
  planeRect(ctx, pl, s.u0 + 1, s.u1 - 1, s.v0 + 1, s.v0 + 2, shade(face, 0.3));
  planeRect(ctx, pl, s.u0 + 1, s.u1 - 1, s.v1 - 2, s.v1 - 1, shade(face, -0.25));
}

/** Blue board with a big white "i". */
function drawInfoSign(ctx: CanvasRenderingContext2D, pl: Plane, s: Sign): void {
  signBoard(ctx, pl, s, '#1e7295');
  const cu = (s.u0 + s.u1) / 2;
  planeRect(ctx, pl, cu - 2, cu + 2, s.v0 + 4, s.v0 + 8, '#ffffff');
  planeRect(ctx, pl, cu - 4, cu + 2, s.v0 + 10, s.v0 + 12, '#ffffff');
  planeRect(ctx, pl, cu - 2, cu + 2, s.v0 + 12, s.v1 - 6, '#ffffff');
  planeRect(ctx, pl, cu - 4, cu + 4, s.v1 - 6, s.v1 - 4, '#ffffff');
}

/** Cream board with a gold / silver / bronze podium and a star. */
function drawRankingSign(ctx: CanvasRenderingContext2D, pl: Plane, s: Sign): void {
  signBoard(ctx, pl, s, '#f6efd9');
  const base = s.v1 - 4;
  const u = s.u0 + 3;
  planeRect(ctx, pl, u, u + 5, base - 6, base, '#aeb6bf');
  planeRect(ctx, pl, u + 5, u + 10, base - 10, base, '#e8b923');
  planeRect(ctx, pl, u + 10, u + 15, base - 4, base, '#c27a3a');
  planeRect(ctx, pl, u + 5, u + 10, base - 10, base - 9, '#ffe27a');
  planeRect(ctx, pl, u + 7, u + 8, base - 15, base - 12, '#e8b923');
  planeRect(ctx, pl, u + 6, u + 9, base - 14, base - 13, '#e8b923');
}

/** Cinder-block wall with a painted lower band, trim and baseboard. */
function paintWall(ctx: CanvasRenderingContext2D, pl: Plane, u0: number, u1: number, c: WallColors): void {
  const upper = WALL_H - PAINT_H;
  planeRect(ctx, pl, u0, u1, 0, upper, c.block);
  planeRect(ctx, pl, u0, u1, upper, WALL_H, c.paint);

  for (let v = 8, row = 0; v < WALL_H - 4; v += 8, row++) {
    const mortar = v < upper ? c.mortar : c.paintMortar;
    planeRect(ctx, pl, u0, u1, v, v + 1, mortar);
    const start = Math.ceil(u0 / 16) * 16 + (row % 2 ? 8 : 0);
    for (let u = start; u < u1; u += 16) planeRect(ctx, pl, u, u + 1, v - 7, v, mortar);
  }

  planeRect(ctx, pl, u0, u1, upper - 3, upper, c.trim);
  planeRect(ctx, pl, u0, u1, WALL_H - 5, WALL_H, c.base);
  planeRect(ctx, pl, u0, u1, 0, 1, c.mortar);
}

interface SkyArt {
  /** Bands of colour from the top of the window down: [height, colour]; the last fills the rest. */
  bands: [number, string][];
  /** Sun or moon: [u, v, size, colour] within the window. */
  orb: [number, number, number, string];
  stars: boolean;
  clouds: string | null;
  skyline: string;
  /** Lit office and apartment windows in the skyline. */
  lights: string | null;
}

const SKIES: Record<Sky, SkyArt> = {
  dawn: {
    bands: [[6, '#93b6e2'], [6, '#f1bdb4'], [6, '#ffd8a0'], [0, '#fff0c4']],
    orb: [8, 15, 5, '#ffffff'],
    stars: false,
    clouds: '#fbe3dc',
    skyline: '#6b6f8e',
    lights: '#ffe3a0',
  },
  day: {
    bands: [[9, '#6fb2ea'], [0, '#a8d6f6']],
    orb: [18, 3, 5, '#fff6b0'],
    stars: false,
    clouds: '#ffffff',
    skyline: '#8796ac',
    lights: null,
  },
  dusk: {
    bands: [[6, '#3a2e6c'], [6, '#9c4c7a'], [6, '#e8784a'], [0, '#f9b35e']],
    orb: [16, 16, 5, '#ffc35a'],
    stars: false,
    clouds: '#c9668a',
    skyline: '#2b2442',
    lights: '#ffd77a',
  },
  night: {
    bands: [[9, '#2d5288'], [0, '#1f3a63']],
    orb: [17, 4, 4, '#e9eefc'],
    stars: true,
    clouds: null,
    skyline: '#121a2e',
    lights: '#f2d06b',
  },
};

/** Brooklyn rooftops along the bottom of the window: [u0, u1, height]. */
const SKYLINE: [number, number, number][] = [
  [0, 4, 6],
  [4, 8, 9],
  [8, 11, 5],
  [11, 16, 11],
  [16, 19, 7],
  [19, 24, 10],
  [24, 28, 5],
];

/** Barred window with the view outside at the given time of day. */
function drawWindow(ctx: CanvasRenderingContext2D, pl: Plane, u: number, v: number, sky: Sky): void {
  const w = 28;
  const h = 26;
  const art = SKIES[sky];
  planeRect(ctx, pl, u - 2, u + w + 2, v - 2, v + h + 2, PAL.windowFrame);

  let y = v;
  for (const [bh, color] of art.bands) {
    const bottom = bh ? Math.min(y + bh, v + h) : v + h;
    planeRect(ctx, pl, u, u + w, y, bottom, color);
    y = bottom;
  }
  if (art.stars) {
    for (const [su, sv] of [[4, 4], [9, 15], [24, 7], [12, 2]]) planeRect(ctx, pl, u + su, u + su + 1, v + sv, v + sv + 1, '#c9d6f5');
  }
  const [ou, ov, size, orbColor] = art.orb;
  planeRect(ctx, pl, u + ou, u + ou + size, v + ov + 1, v + ov + size - 1, orbColor);
  planeRect(ctx, pl, u + ou + 1, u + ou + size - 1, v + ov, v + ov + size, orbColor);
  if (art.clouds) {
    planeRect(ctx, pl, u + 2, u + 9, v + 7, v + 9, art.clouds);
    planeRect(ctx, pl, u + 4, u + 8, v + 6, v + 7, art.clouds);
    planeRect(ctx, pl, u + 21, u + 27, v + 11, v + 12, art.clouds);
  }

  for (const [u0, u1, bh] of SKYLINE) {
    planeRect(ctx, pl, u + u0, u + u1, v + h - bh, v + h, art.skyline);
    if (!art.lights) continue;
    for (let lu = u0 + 1; lu < u1 - 1; lu += 2) {
      for (let lv = h - bh + 2; lv < h - 1; lv += 3) {
        if ((lu * 7 + lv * 3) % 5 < 2) planeRect(ctx, pl, u + lu, u + lu + 1, v + lv, v + lv + 1, art.lights);
      }
    }
  }

  for (const bx of [6, 13, 20]) planeRect(ctx, pl, u + bx, u + bx + 2, v, v + h, '#2a2e35');
  planeRect(ctx, pl, u, u + w, v + 12, v + 14, '#2a2e35');
  planeRect(ctx, pl, u - 4, u + w + 4, v + h + 2, v + h + 5, shade(PAL.wallBlock, 0.25));
}

function drawWallLamp(ctx: CanvasRenderingContext2D, pl: Plane, u: number, dim: boolean): void {
  planeRect(ctx, pl, u - 8, u + 8, 8, 13, PAL.lampHousing);
  planeRect(ctx, pl, u - 6, u + 6, 13, 16, dim ? shade(PAL.lamp, -0.2) : PAL.lamp);
  for (const i of [-3, 1]) planeRect(ctx, pl, u + i, u + i + 1, 13, 16, PAL.lampHousing);
}

/** Family photos and a letter taped above the desk. */
function drawPhotos(ctx: CanvasRenderingContext2D, pl: Plane, u: number, v: number): void {
  const items: [number, number, number, number, string, string][] = [
    [-20, 3, 11, 12, '#e2d4b4', '#7c9068'],
    [-6, -1, 12, 15, PAL.paper, '#9aa4ae'],
    [9, 4, 11, 9, '#cfdbe2', '#6a8296'],
  ];
  for (const [du, dv, w, h, paper, photo] of items) {
    planeRect(ctx, pl, u + du + 1, u + du + w + 1, v + dv + 1, v + dv + h + 1, 'rgba(0, 0, 0, 0.2)');
    planeRect(ctx, pl, u + du, u + du + w, v + dv, v + dv + h, paper);
    if (photo === '#9aa4ae') {
      for (let i = 0; i < 4; i++) planeRect(ctx, pl, u + du + 2, u + du + w - 2, v + dv + 3 + i * 3, v + dv + 4 + i * 3, photo);
    } else {
      planeRect(ctx, pl, u + du + 2, u + du + w - 2, v + dv + 2, v + dv + h - 3, photo);
    }
  }
}

/** Days-served tally scratched into the wall. */
function drawTally(ctx: CanvasRenderingContext2D, pl: Plane, u: number, v: number): void {
  const c = shade(PAL.wallBlock, -0.35);
  for (let g = 0; g < 2; g++) {
    const u0 = u - 10 + g * 12;
    for (let i = 0; i < 4; i++) planeRect(ctx, pl, u0 + i * 2, u0 + i * 2 + 1, v, v + 9, c);
    for (let i = 0; i < 8; i++) planeRect(ctx, pl, u0 - 1 + i, u0 + i, v + 6 - Math.floor(i * 0.6), v + 7 - Math.floor(i * 0.6), c);
  }
}

function drawMirror(ctx: CanvasRenderingContext2D, pl: Plane, u: number, v: number): void {
  planeRect(ctx, pl, u - 8, u + 8, v - 1, v + 19, '#5f6771');
  planeRect(ctx, pl, u - 7, u + 7, v, v + 18, '#aab6c1');
  planeRect(ctx, pl, u - 7, u + 7, v, v + 6, '#d5dee6');
  planeRect(ctx, pl, u - 4, u - 2, v + 2, v + 14, '#eef3f7');
}

function drawShadows(ctx: CanvasRenderingContext2D): void {
  for (const { x, y, w, d } of PROPS) {
    fillPoly(ctx, tileQuad(x + 0.05, y + 0.08, w + 0.04, d + 0.04), 'rgba(0, 0, 0, 0.18)');
  }
}

const tileQuad = (x: number, y: number, w: number, d: number) => [projectPx(x, y), projectPx(x + w, y), projectPx(x + w, y + d), projectPx(x, y + d)];

// ---------------------------------------------------------------------------
// Depth-sorted objects

interface Drawable {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  draw(ctx: CanvasRenderingContext2D): void;
}

function buildDrawables(): Drawable[] {
  const list: Drawable[] = PROPS.map((p) => ({
    minX: p.x,
    maxX: p.x + p.w,
    minY: p.y,
    maxY: p.y + p.d,
    draw: (ctx) => PROP_DRAW[p.kind](ctx, p),
  }));

  for (let x = 0; x < CELL_W; x++) {
    list.push({ minX: x, maxX: x + 1, minY: 0, maxY: 0, draw: (ctx) => drawBars(ctx, x, x === DOOR_X) });
  }

  const r = 0.08;
  list.push({
    minX: CELL_W - r,
    maxX: CELL_W + r,
    minY: -r,
    maxY: r,
    draw: (ctx) => boxPx(ctx, CELL_W - r, -r, 0, r * 2, r * 2, BAR_H + 6, boxStyle(PAL.pillar, false)),
  });

  const lintelZ = BAR_H + 6;
  list.push({
    minX: 0,
    maxX: CELL_W,
    minY: -0.1,
    maxY: 0.1,
    draw: (ctx) =>
      boxPx(ctx, 0, -0.1, lintelZ, CELL_W + r, 0.2, WALL_H - lintelZ, {
        top: PAL.wallCap,
        left: shade(PAL.wallBlock, -0.12),
        right: PAL.wallEnd,
      }),
  });
  return list;
}

/** Negative if a must be drawn before b, positive for the reverse, 0 if footprints overlap. */
function order(a: Drawable, b: Drawable): number {
  if (a.maxX <= b.minX && a.minX < b.maxX) return -1;
  if (b.maxX <= a.minX && b.minX < a.maxX) return 1;
  if (a.maxY <= b.minY && a.minY < b.maxY) return -1;
  if (b.maxY <= a.minY && b.minY < a.maxY) return 1;
  return 0;
}

/** Topological painter's sort on footprints; ties fall back to distance from the back corner. */
function depthSort(items: Drawable[]): Drawable[] {
  const n = items.length;
  const next: number[][] = items.map(() => []);
  const indegree = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const o = order(items[i], items[j]);
      if (o < 0) {
        next[i].push(j);
        indegree[j]++;
      } else if (o > 0) {
        next[j].push(i);
        indegree[i]++;
      }
    }
  }

  const key = (d: Drawable) => d.minX + d.maxX + d.minY + d.maxY;
  const done = new Array<boolean>(n).fill(false);
  const out: Drawable[] = [];
  while (out.length < n) {
    let pick = -1;
    for (let k = 0; k < n; k++) {
      if (!done[k] && indegree[k] === 0 && (pick < 0 || key(items[k]) < key(items[pick]))) pick = k;
    }
    if (pick < 0) {
      for (let k = 0; k < n; k++) if (!done[k] && (pick < 0 || key(items[k]) < key(items[pick]))) pick = k;
    }
    done[pick] = true;
    out.push(items[pick]);
    for (const j of next[pick]) indegree[j]--;
  }
  return out;
}

/** One tile-wide section of the barred cell front along y = 0. */
function drawBars(ctx: CanvasRenderingContext2D, x: number, door: boolean): void {
  const rail = (z: number) => {
    linePx(ctx, projectPx(x, 0, z), projectPx(x + 1, 0, z), PAL.bar);
    linePx(ctx, projectPx(x, 0, z + 1), projectPx(x + 1, 0, z + 1), PAL.bar);
  };
  const post = (t: number, width: number) => {
    const b = projectPx(x + t, 0, 0);
    ctx.fillStyle = PAL.bar;
    ctx.fillRect(b.x - 1, b.y - BAR_H, width, BAR_H);
    ctx.fillStyle = PAL.barLight;
    ctx.fillRect(b.x - 1, b.y - BAR_H, 1, BAR_H);
  };

  rail(2);
  const count = 5;
  for (let i = 0; i < count; i++) post(0.04 + ((i + 0.5) / count) * 0.92, 2);
  rail(Math.round(BAR_H * 0.55));

  if (door) {
    post(0.05, 3);
    post(0.95, 3);
    boxPx(ctx, x + 0.72, 0.02, 34, 0.14, 0.08, 12, boxStyle('#3b424a'));
  }

  boxPx(ctx, x, -0.06, BAR_H, 1, 0.12, 6, boxStyle(PAL.beam, false));
}

// ---------------------------------------------------------------------------
// Props

const PROP_DRAW: Record<PropKind, (ctx: CanvasRenderingContext2D, p: Prop) => void> = {
  bunk: drawBunk,
  desk: drawDesk,
  stool: drawStool,
  toilet: drawToilet,
  sink: drawSink,
};

const STEEL: BoxStyle = boxStyle(PAL.steel, false);

function drawBunk(ctx: CanvasRenderingContext2D, { x, y, w, d, h }: Prop): void {
  const p = 0.07;
  const post = (px: number, py: number) => boxPx(ctx, px, py, 0, p, p, h, STEEL);
  post(x, y);
  post(x + w - p, y);
  for (const z of [10, 50]) {
    boxPx(ctx, x, y, z, w, d, 4, STEEL);
    boxPx(ctx, x + 0.04, y + 0.04, z + 4, w - 0.08, d - 0.08, 7, boxStyle(PAL.mattress));
    boxPx(ctx, x + 0.12, y + 0.1, z + 11, w - 0.24, 0.34, 4, boxStyle(PAL.pillow));
    boxPx(ctx, x + 0.05, y + d - 0.78, z + 11, w - 0.1, 0.66, 3, boxStyle(PAL.blanket));
  }
  post(x, y + d - p);
  post(x + w - p, y + d - p);
}

/** Small writing desk against the side wall, with a letter in progress. */
function drawDesk(ctx: CanvasRenderingContext2D, { x, y, w, d, h }: Prop): void {
  const top = h - 3;
  boxPx(ctx, x + w - 0.1, y + 0.05, 0, 0.07, 0.07, top, STEEL);
  boxPx(ctx, x + w - 0.1, y + d - 0.12, 0, 0.07, 0.07, top, STEEL);
  boxPx(ctx, x, y, top, w, d, 3, boxStyle(PAL.deskTop));
  boxPx(ctx, x + 0.18, y + 0.18, h, 0.32, 0.4, 1, boxStyle(PAL.paper, false));
  boxPx(ctx, x + 0.14, y + 0.64, h, 0.3, 0.24, 3, boxStyle(PAL.envelope));
  linePx(ctx, projectPx(x + 0.3, y + 0.28, h + 1), projectPx(x + 0.46, y + 0.5, h + 1), PAL.pencil);
}

function drawStool(ctx: CanvasRenderingContext2D, { x, y, w, d }: Prop): void {
  boxPx(ctx, x + w / 2 - 0.04, y + d / 2 - 0.04, 0, 0.08, 0.08, SEAT_Z - 3, STEEL);
  boxPx(ctx, x, y, SEAT_Z - 3, w, d, 3, boxStyle(PAL.steelLight));
}

/** Steel toilet with its tank against the side wall, facing into the cell. */
function drawToilet(ctx: CanvasRenderingContext2D, { x, y, w, d, h }: Prop): void {
  const steel = boxStyle(PAL.steelLight);
  boxPx(ctx, x, y, 0, 0.16, d, h, steel);
  boxPx(ctx, x + 0.16, y + 0.06, 0, w - 0.16, d - 0.12, SEAT_Z, steel);
  fillPoly(ctx, [projectPx(x + 0.24, y + 0.14, SEAT_Z), projectPx(x + w - 0.08, y + 0.14, SEAT_Z), projectPx(x + w - 0.08, y + d - 0.14, SEAT_Z), projectPx(x + 0.24, y + d - 0.14, SEAT_Z)], '#4d5864');
}

function drawSink(ctx: CanvasRenderingContext2D, { x, y, w, d, h }: Prop): void {
  const basin = h - 8;
  boxPx(ctx, x, y + d / 2 - 0.05, 0, 0.1, 0.1, basin, STEEL);
  boxPx(ctx, x, y, basin, w, d, 8, boxStyle(PAL.steelLight));
  fillPoly(ctx, [projectPx(x + 0.12, y + 0.09, h), projectPx(x + w - 0.07, y + 0.09, h), projectPx(x + w - 0.07, y + d - 0.09, h), projectPx(x + 0.12, y + d - 0.09, h)], '#5f6d7a');
  boxPx(ctx, x + 0.02, y + d / 2 - 0.04, h, 0.08, 0.08, 7, STEEL);
}
