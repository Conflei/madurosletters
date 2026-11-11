import { HALF_H, HALF_W } from '../config';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tile-space (x, y) plus height z in pixels -> world pixel position. */
export function project(x: number, y: number, z = 0): Vec2 {
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H - z };
}

/** Same as project, snapped to whole pixels. */
export function projectPx(x: number, y: number, z = 0): Vec2 {
  const p = project(x, y, z);
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

/** World pixel position on the floor plane (z = 0) -> fractional tile coordinates. */
export function unproject(wx: number, wy: number): Vec2 {
  const a = wx / HALF_W;
  const b = wy / HALF_H;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Screen silhouette of an axis-aligned box (convex hexagon, in order). */
export function boxHull(x: number, y: number, w: number, d: number, h: number): Vec2[] {
  return [project(x, y, h), project(x + w, y, h), project(x + w, y, 0), project(x + w, y + d, 0), project(x, y + d, 0), project(x, y + d, h)];
}

export function insideConvex(pts: Vec2[], p: Vec2): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const s = Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    if (s === 0) continue;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
