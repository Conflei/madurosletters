import { BAR_H, FLOOR_T, PAINT_H, PAL, WALL_H, WALL_T } from '../config';
import type { Bounds } from '../engine/Camera';
import {
  boxColors,
  floorGlow,
  isoBox,
  line,
  PLANE_U,
  poly,
  seededRandom,
  shade,
  tileDiamond,
  withPlaneX,
  withPlaneY,
} from '../engine/draw';
import { project } from '../engine/iso';
import { CELL_D, CELL_W, CORRIDOR_D, DOOR_X, PROPS, SEAT_Z, type Prop, type PropKind } from './cellMap';

export interface Lamp {
  x: number;
  y: number;
  z: number;
  flicker?: boolean;
}

export interface RoomImage {
  image: HTMLCanvasElement;
  bounds: Bounds;
}

/** y of the corridor's far wall. */
const BACK = -CORRIDOR_D;
/** Converts a y position on the side wall into local plane u (measured from the front end). */
const sideU = (y: number) => (CELL_D - y) * PLANE_U;

export const LAMP_V = 10;
const LAMP_Z = WALL_H - LAMP_V - 3;

export const LAMPS: Lamp[] = [
  { x: 0, y: 2.75, z: LAMP_Z },
  { x: CELL_W / 2, y: BACK, z: LAMP_Z, flicker: true },
];

export function cellBounds(): Bounds {
  const pts = [
    project(-WALL_T, BACK - WALL_T, WALL_H),
    project(CELL_W, BACK - WALL_T, WALL_H),
    project(-WALL_T, CELL_D, -FLOOR_T),
    project(CELL_W, BACK - WALL_T, -FLOOR_T),
    project(CELL_W, CELL_D, -FLOOR_T),
  ];
  const pad = 6;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

/** Paints the static cell once into an offscreen canvas at `scale` pixels per world pixel. */
export function renderCell(scale: number): RoomImage {
  const bounds = cellBounds();
  const image = document.createElement('canvas');
  image.width = Math.ceil(bounds.w * scale);
  image.height = Math.ceil(bounds.h * scale);
  const ctx = image.getContext('2d');
  if (!ctx) throw new Error('Unable to create offscreen canvas');
  ctx.setTransform(scale, 0, 0, scale, -bounds.x * scale, -bounds.y * scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Walls extend below the floor line for their end caps, so the floor must cover them afterwards.
  drawWallBoxes(ctx);
  drawFloor(ctx);
  drawWallFaces(ctx);
  drawLightPools(ctx);
  drawShadows(ctx);
  for (const d of depthSort(buildDrawables())) d.draw(ctx);

  return { image, bounds };
}

// ---------------------------------------------------------------------------
// Floor & walls

function drawFloor(ctx: CanvasRenderingContext2D): void {
  isoBox(ctx, 0, BACK, -FLOOR_T, CELL_W, CELL_D - BACK, FLOOR_T, { top: PAL.cellFloor, left: PAL.slabLeft, right: PAL.slabRight });

  const rand = seededRandom(11);
  for (let y = BACK; y < CELL_D; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const base = y < 0 ? PAL.corridor : PAL.cellFloor;
      const checker = (x + y) % 2 === 0 ? 0 : -0.035;
      poly(ctx, tileDiamond(x, y), shade(base, checker + (rand() - 0.5) * 0.03), PAL.grout, 0.75);
      for (let i = 0; i < 6; i++) {
        const p = project(x + 0.1 + rand() * 0.8, y + 0.1 + rand() * 0.8);
        ctx.fillStyle = rand() < 0.5 ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.08)';
        ctx.fillRect(p.x, p.y, 1.2, 0.8);
      }
    }
  }

  // Floor drain.
  const drain = project(1.8, 4.1);
  ctx.save();
  ctx.translate(drain.x, drain.y);
  ctx.scale(1, 0.5);
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#4a5058';
  ctx.fill();
  ctx.fillStyle = '#2a2f36';
  for (let i = -3; i <= 3; i += 2) ctx.fillRect(i - 0.5, -4, 1, 8);
  ctx.restore();

  // Contact shadows where the floor meets walls and the bars.
  const c = 'rgba(0, 0, 0, 0.1)';
  for (const depth of [0.18, 0.4]) {
    poly(ctx, [project(0, BACK), project(depth, BACK), project(depth, CELL_D), project(0, CELL_D)], c);
    poly(ctx, [project(0, BACK), project(CELL_W, BACK), project(CELL_W, BACK + depth), project(0, BACK + depth)], c);
  }
  poly(ctx, [project(0, 0), project(CELL_W, 0), project(CELL_W, 0.15), project(0, 0.15)], c);
}

function drawWallBoxes(ctx: CanvasRenderingContext2D): void {
  const t = WALL_T;
  const h = WALL_H + FLOOR_T;
  // Side wall first so the corridor wall caps the shared corner.
  isoBox(ctx, -t, BACK - t, -FLOOR_T, t, CELL_D - BACK + t, h, { top: PAL.wallTop, left: PAL.wallEnd, right: PAL.block });
  isoBox(ctx, 0, BACK - t, -FLOOR_T, CELL_W, t, h, { top: PAL.wallTop, left: PAL.block, right: PAL.wallEnd });
}

function drawWallFaces(ctx: CanvasRenderingContext2D): void {
  const corridorDim = 'rgba(8, 10, 16, 0.42)';

  // Far corridor wall, seen through the bars.
  withPlaneY(ctx, 0, BACK, WALL_H, () => {
    const len = CELL_W * PLANE_U;
    paintWallFace(ctx, len, -0.1, 0);
    ctx.fillStyle = corridorDim;
    ctx.fillRect(0, 0, len, WALL_H);
    drawWallLamp(ctx, len / 2, LAMP_V);
  });

  // Solid side wall of the cell (continues into the corridor beyond the bars).
  withPlaneX(ctx, 0, CELL_D, WALL_H, () => {
    const len = (CELL_D - BACK) * PLANE_U;
    paintWallFace(ctx, len, -0.12, len);
    ctx.fillStyle = corridorDim;
    ctx.fillRect(sideU(0), 0, len - sideU(0), WALL_H);

    drawWindow(ctx, sideU(1.1) - 16, 22, 32, 28);
    drawWallLamp(ctx, sideU(LAMPS[0].y), LAMP_V);
    drawPhotos(ctx, sideU(2.75), 40);
    drawTally(ctx, sideU(3.95), 46);
    drawMirror(ctx, sideU(4.52), 42);
  });
}

/** Cinder-block wall, painted lower band, trim, baseboard, ceiling and corner occlusion. */
function paintWallFace(ctx: CanvasRenderingContext2D, len: number, dark: number, cornerU: number): void {
  const upper = WALL_H - PAINT_H;
  ctx.fillStyle = shade(PAL.block, dark);
  ctx.fillRect(0, 0, len, upper);
  ctx.fillStyle = shade(PAL.paint, dark);
  ctx.fillRect(0, upper, len, PAINT_H);

  ctx.fillStyle = PAL.mortar;
  for (let row = 0, v = 0; v < WALL_H - 6; row++, v += 12) {
    ctx.fillRect(0, v, len, 0.8);
    for (let u = row % 2 ? 12 : 0; u < len; u += 24) ctx.fillRect(u, v, 0.8, 12);
  }

  ctx.fillStyle = PAL.paintTrim;
  ctx.fillRect(0, upper - 3, len, 3);
  ctx.fillStyle = PAL.baseboard;
  ctx.fillRect(0, WALL_H - 6, len, 6);

  const top = ctx.createLinearGradient(0, 0, 0, 36);
  top.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
  top.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, len, 36);

  const dir = cornerU === 0 ? 1 : -1;
  const corner = ctx.createLinearGradient(cornerU, 0, cornerU + dir * 40, 0);
  corner.addColorStop(0, 'rgba(0, 0, 0, 0.25)');
  corner.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = corner;
  ctx.fillRect(cornerU === 0 ? 0 : len - 40, 0, 40, WALL_H);
}

function drawWindow(ctx: CanvasRenderingContext2D, u: number, v: number, w: number, h: number): void {
  ctx.fillStyle = PAL.windowFrame;
  ctx.fillRect(u - 3, v - 3, w + 6, h + 6);
  const sky = ctx.createLinearGradient(0, v, 0, v + h);
  sky.addColorStop(0, '#2a4a7a');
  sky.addColorStop(1, '#0d1626');
  ctx.fillStyle = sky;
  ctx.fillRect(u, v, w, h);
  ctx.fillStyle = 'rgba(220, 230, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(u + w * 0.7, v + h * 0.3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(220, 230, 255, 0.6)';
  ctx.fillRect(u + 4, v + 5, 1, 1);
  ctx.fillRect(u + 10, v + 15, 1, 1);
  ctx.fillStyle = PAL.bar;
  for (let i = 1; i < 4; i++) ctx.fillRect(u + (w * i) / 4 - 0.9, v, 1.8, h);
  ctx.fillRect(u, v + h / 2 - 0.8, w, 1.6);
  ctx.fillStyle = shade(PAL.block, 0.25);
  ctx.fillRect(u - 5, v + h + 3, w + 10, 3);
}

function drawWallLamp(ctx: CanvasRenderingContext2D, u: number, v: number): void {
  ctx.fillStyle = '#3a424c';
  ctx.fillRect(u - 9, v, 18, 5);
  ctx.fillStyle = PAL.lamp;
  ctx.fillRect(u - 7, v + 5, 14, 3);
  ctx.fillStyle = 'rgba(40, 44, 50, 0.8)';
  for (let i = -4; i <= 4; i += 4) ctx.fillRect(u + i - 0.4, v + 5, 0.8, 3);
}

/** Family photos and a letter taped above the desk. */
function drawPhotos(ctx: CanvasRenderingContext2D, u: number, v: number): void {
  const items: [number, number, number, number, string][] = [
    [u - 20, v + 2, 11, 13, '#d8c9a8'],
    [u - 6, v - 2, 12, 15, PAL.paper],
    [u + 9, v + 4, 11, 9, '#c9d6de'],
  ];
  for (const [x, y, w, h, color] of items) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(x + 1, y + 1, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(x + w / 2 - 2, y - 1, 4, 2);
  }
  ctx.fillStyle = 'rgba(60, 70, 80, 0.5)';
  for (let i = 0; i < 4; i++) ctx.fillRect(u - 4, v + 2 + i * 3, 8, 0.7);
  ctx.fillStyle = '#7a8a6a';
  ctx.fillRect(u - 18, v + 5, 7, 6);
  ctx.fillStyle = '#6a7f92';
  ctx.fillRect(u + 11, v + 6, 7, 5);
}

/** Days-served tally scratched into the wall. */
function drawTally(ctx: CanvasRenderingContext2D, u: number, v: number): void {
  ctx.strokeStyle = 'rgba(40, 46, 54, 0.55)';
  ctx.lineWidth = 0.8;
  for (let g = 0; g < 2; g++) {
    const x0 = u - 10 + g * 12;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(x0 + i * 2, v);
      ctx.lineTo(x0 + i * 2, v + 9);
    }
    ctx.moveTo(x0 - 1, v + 7);
    ctx.lineTo(x0 + 7, v + 2);
    ctx.stroke();
  }
}

function drawMirror(ctx: CanvasRenderingContext2D, u: number, v: number): void {
  ctx.fillStyle = '#5b636d';
  ctx.fillRect(u - 8, v - 1, 16, 20);
  const g = ctx.createLinearGradient(u - 7, v, u + 7, v + 18);
  g.addColorStop(0, '#dfe6ec');
  g.addColorStop(0.5, '#9aa6b1');
  g.addColorStop(1, '#c7d0d8');
  ctx.fillStyle = g;
  ctx.fillRect(u - 7, v, 14, 18);
}

function drawLightPools(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  floorGlow(ctx, project(1.3, LAMPS[0].y), 90, 'rgba(255, 200, 130, 0.12)');
  floorGlow(ctx, project(1.5, BACK + 0.8), 60, 'rgba(255, 200, 130, 0.08)');
  floorGlow(ctx, project(1.7, 1.4), 55, 'rgba(140, 170, 255, 0.08)');
  ctx.restore();
}

function drawShadows(ctx: CanvasRenderingContext2D): void {
  const fill = 'rgba(10, 12, 16, 0.28)';
  for (const { x, y, w, d } of PROPS) {
    const e = 0.05;
    const ox = 0.06;
    const oy = 0.1;
    poly(ctx, [project(x - e + ox, y - e + oy), project(x + w + e + ox, y - e + oy), project(x + w + e + ox, y + d + e + oy), project(x - e + ox, y + d + e + oy)], fill);
  }
}

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
    draw: (ctx) => isoBox(ctx, CELL_W - r, -r, 0, r * 2, r * 2, BAR_H + 8, boxColors(PAL.pillar)),
  });

  const lintelZ = BAR_H + 8;
  list.push({
    minX: 0,
    maxX: CELL_W,
    minY: -0.1,
    maxY: 0.1,
    draw: (ctx) => isoBox(ctx, 0, -0.1, lintelZ, CELL_W + r, 0.2, WALL_H - lintelZ, boxColors(PAL.block)),
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
  const at = (t: number, z: number) => project(x + t, 0, z);
  const s0 = 0.04;
  const s1 = 0.96;

  line(ctx, at(s0, 4), at(s1, 4), PAL.bar, 2.6);
  const count = 5;
  for (let i = 0; i < count; i++) {
    const t = s0 + ((i + 0.5) / count) * (s1 - s0);
    const b = at(t, 0);
    const top = at(t, BAR_H);
    line(ctx, b, top, PAL.bar, 2.2);
    line(ctx, { x: b.x - 0.5, y: b.y }, { x: top.x - 0.5, y: top.y }, PAL.barLight, 0.7);
  }
  line(ctx, at(s0, BAR_H * 0.55), at(s1, BAR_H * 0.55), PAL.bar, 2);

  if (door) {
    line(ctx, at(s0 + 0.02, 0), at(s0 + 0.02, BAR_H), PAL.bar, 3.4);
    line(ctx, at(s1 - 0.02, 0), at(s1 - 0.02, BAR_H), PAL.bar, 3.4);
    isoBox(ctx, x + 0.74, 0.02, 36, 0.12, 0.08, 12, boxColors('#3b424a'));
  }

  isoBox(ctx, x, -0.06, BAR_H, 1, 0.12, 8, boxColors(PAL.beam));
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

function drawBunk(ctx: CanvasRenderingContext2D, { x, y, w, d }: Prop): void {
  const steel = boxColors(PAL.steel);
  const p = 0.07;
  const post = (px: number, py: number) => isoBox(ctx, px, py, 0, p, p, 64, steel);
  post(x, y);
  post(x + w - p, y);
  for (const z of [10, 50]) {
    isoBox(ctx, x, y, z, w, d, 4, steel);
    isoBox(ctx, x + 0.04, y + 0.04, z + 4, w - 0.08, d - 0.08, 7, boxColors(PAL.mattress));
    isoBox(ctx, x + 0.12, y + 0.1, z + 11, w - 0.24, 0.32, 4, boxColors(PAL.pillow));
    isoBox(ctx, x + 0.06, y + d - 0.75, z + 11, w - 0.12, 0.62, 2.5, boxColors(PAL.blanket));
  }
  post(x, y + d - p);
  post(x + w - p, y + d - p);
}

/** Small writing desk against the side wall, with a letter in progress. */
function drawDesk(ctx: CanvasRenderingContext2D, { x, y, w, d }: Prop): void {
  const steel = boxColors(PAL.steel);
  isoBox(ctx, x + w - 0.1, y + 0.05, 0, 0.06, 0.06, 26, steel);
  isoBox(ctx, x + w - 0.1, y + d - 0.11, 0, 0.06, 0.06, 26, steel);
  isoBox(ctx, x, y, 26, w, d, 3, boxColors(PAL.deskTop));
  isoBox(ctx, x + 0.18, y + 0.18, 29, 0.32, 0.4, 0.8, boxColors(PAL.paper));
  isoBox(ctx, x + 0.14, y + 0.66, 29, 0.3, 0.22, 3, boxColors(PAL.envelope));
  line(ctx, project(x + 0.3, y + 0.28, 30.5), project(x + 0.46, y + 0.5, 30.5), PAL.signText, 1.2);
}

function drawStool(ctx: CanvasRenderingContext2D, { x, y, w, d }: Prop): void {
  isoBox(ctx, x + w / 2 - 0.04, y + d / 2 - 0.04, 0, 0.08, 0.08, SEAT_Z - 3, boxColors(PAL.steel));
  isoBox(ctx, x, y, SEAT_Z - 3, w, d, 3, boxColors(PAL.steelLight));
}

/** Steel toilet with its tank against the side wall, facing into the cell. */
function drawToilet(ctx: CanvasRenderingContext2D, { x, y, w, d, h }: Prop): void {
  const steel = boxColors(PAL.steelLight);
  isoBox(ctx, x, y, 0, 0.16, d, h, steel);
  isoBox(ctx, x + 0.16, y + 0.06, 0, w - 0.16, d - 0.12, SEAT_Z, steel);
  poly(ctx, [project(x + 0.22, y + 0.13, SEAT_Z), project(x + w - 0.06, y + 0.13, SEAT_Z), project(x + w - 0.06, y + d - 0.13, SEAT_Z), project(x + 0.22, y + d - 0.13, SEAT_Z)], '#4a5560');
}

function drawSink(ctx: CanvasRenderingContext2D, { x, y, w, d }: Prop): void {
  isoBox(ctx, x, y + d / 2 - 0.05, 0, 0.1, 0.1, 24, boxColors(PAL.steel));
  isoBox(ctx, x, y, 24, w, d, 8, boxColors(PAL.steelLight));
  poly(ctx, [project(x + 0.12, y + 0.08, 32), project(x + w - 0.06, y + 0.08, 32), project(x + w - 0.06, y + d - 0.08, 32), project(x + 0.12, y + d - 0.08, 32)], '#5d6b78');
  isoBox(ctx, x + 0.02, y + d / 2 - 0.03, 32, 0.08, 0.06, 7, boxColors(PAL.steel));
}
