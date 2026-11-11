import { projectPx, type Vec2 } from './iso';

/*
 * Pixel-art primitives. Everything snaps to whole pixels and is painted with fillRect, so
 * nothing is anti-aliased: iso edges come out as the classic 2:1 Habbo stair-step.
 */

/** Scanline fill of a convex polygon. */
export function fillPoly(ctx: CanvasRenderingContext2D, pts: Vec2[], color: string): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  ctx.fillStyle = color;
  const n = pts.length;
  for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
    const cy = y + 0.5;
    let xl = Infinity;
    let xr = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      if ((a.y <= cy && b.y > cy) || (b.y <= cy && a.y > cy)) {
        const x = a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x);
        xl = Math.min(xl, x);
        xr = Math.max(xr, x);
      }
    }
    const x0 = Math.round(xl);
    const x1 = Math.round(xr);
    if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
  }
}

/** 1px Bresenham line. */
export function linePx(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, color: string): void {
  let x0 = Math.round(a.x);
  let y0 = Math.round(a.y);
  const x1 = Math.round(b.x);
  const y1 = Math.round(b.y);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = color;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

export function ellipsePx(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  for (let y = -ry; y < ry; y++) {
    const t = (y + 0.5) / ry;
    const hw = Math.round(rx * Math.sqrt(1 - t * t));
    if (hw > 0) ctx.fillRect(Math.round(cx) - hw, Math.round(cy) + y, hw * 2, 1);
  }
}

/** Mix a #rrggbb color toward white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const t = Math.min(1, Math.abs(amount));
  const mix = (c: number) => Math.round(c + (target - c) * t);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

export interface BoxStyle {
  top: string;
  left: string;
  right: string;
  /** Dark silhouette outline (Habbo furni style). */
  line?: string;
  /** Light edge where the top meets the sides. */
  hi?: string;
}

/** Habbo three-tone shading: lit top, mid left face, dark right face. */
export function boxStyle(base: string, outlined = true): BoxStyle {
  return {
    top: shade(base, 0.16),
    left: base,
    right: shade(base, -0.22),
    line: outlined ? shade(base, -0.62) : undefined,
    hi: outlined ? shade(base, 0.42) : undefined,
  };
}

/** Axis-aligned box: footprint (x, y, w, d) in tiles, elevation z and height h in pixels. */
export function boxPx(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, w: number, d: number, h: number, s: BoxStyle): void {
  const bl = projectPx(x, y + d, z);
  const bf = projectPx(x + w, y + d, z);
  const br = projectPx(x + w, y, z);
  const tb = projectPx(x, y, z + h);
  const tl = projectPx(x, y + d, z + h);
  const tf = projectPx(x + w, y + d, z + h);
  const tr = projectPx(x + w, y, z + h);

  if (h > 0) {
    fillPoly(ctx, [bl, bf, tf, tl], s.left);
    fillPoly(ctx, [bf, br, tr, tf], s.right);
  }
  fillPoly(ctx, [tb, tr, tf, tl], s.top);

  if (s.hi) {
    linePx(ctx, tl, tf, s.hi);
    linePx(ctx, tf, tr, s.hi);
  }
  if (s.line) {
    const hull = h > 0 ? [tb, tr, br, bf, bl, tl] : [tb, tr, tf, tl];
    for (let i = 0; i < hull.length; i++) linePx(ctx, hull[i], hull[(i + 1) % hull.length], s.line);
  }
}

export function tileDiamond(x: number, y: number, z = 0): Vec2[] {
  return [projectPx(x, y, z), projectPx(x + 1, y, z), projectPx(x + 1, y + 1, z), projectPx(x, y + 1, z)];
}

/**
 * A wall face in screen space. `u` is screen-x pixels to the right of the origin and `v` is
 * pixels down from the wall's top edge; slope +1 walls drop 1px every 2px, slope -1 walls rise.
 */
export interface Plane {
  x: number;
  y: number;
  slope: 1 | -1;
}

export function planeRect(ctx: CanvasRenderingContext2D, pl: Plane, u0: number, u1: number, v0: number, v1: number, color: string): void {
  const a = Math.round(u0);
  const b = Math.round(u1);
  const top = Math.round(v0);
  const h = Math.round(v1) - top;
  if (h <= 0) return;
  ctx.fillStyle = color;
  for (let u = a; u < b; u++) {
    const dy = pl.slope > 0 ? Math.floor(u / 2) : -Math.floor((u + 1) / 2);
    ctx.fillRect(pl.x + u, pl.y + dy + top, 1, h);
  }
}

/** Deterministic PRNG so procedural details look identical on every load. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
